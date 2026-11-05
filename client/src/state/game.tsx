import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
  type ReactNode,
} from 'react';
import {
  err,
  type AnswerReceipt,
  type GameIntro,
  type MatchResults,
  type PlayverseError,
  type Result,
  type RoomState,
  type RoundAnswerState,
  type RoundQuestion,
  type RoundReveal,
} from '@playverse/shared';
import { getSocket, type PlayverseSocket } from '../net/socket';
import { useRoom } from './room';

const ACK_TIMEOUT_MS = 6000;

interface GameState {
  intro: GameIntro | null;
  question: RoundQuestion | null;
  answers: RoundAnswerState | null;
  reveal: RoundReveal | null;
  results: MatchResults | null;
  myAnswer: AnswerReceipt | null;
  submitting: boolean;
  readied: boolean;
  error: PlayverseError | null;
}

const INITIAL: GameState = {
  intro: null,
  question: null,
  answers: null,
  reveal: null,
  results: null,
  myAnswer: null,
  submitting: false,
  readied: false,
  error: null,
};

type Action =
  | { type: 'intro'; intro: GameIntro }
  | { type: 'question'; question: RoundQuestion }
  | { type: 'answers'; answers: RoundAnswerState }
  | { type: 'reveal'; reveal: RoundReveal }
  | { type: 'results'; results: MatchResults }
  | { type: 'submitting'; submitting: boolean }
  | { type: 'answered'; receipt: AnswerReceipt }
  | { type: 'readied' }
  | { type: 'error'; error: PlayverseError | null }
  | { type: 'reset' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'intro': {
      if (state.intro && action.intro.roundIndex < state.intro.roundIndex) return state;
      const sameRound = state.intro?.roundIndex === action.intro.roundIndex;
      return {
        ...INITIAL,
        intro: action.intro,
        readied: sameRound ? state.readied : false,
      };
    }
    case 'question': {
      if (state.question && action.question.roundIndex < state.question.roundIndex) return state;
      return {
        ...state,
        intro: null,
        question: action.question,
        myAnswer:
          state.question?.roundIndex === action.question.roundIndex
            ? state.myAnswer
            : null,
        answers:
          state.question?.roundIndex === action.question.roundIndex
            ? state.answers
            : null,
        reveal: null,
        submitting: false,
        error: null,
      };
    }
    case 'answers': {
      if (state.question && action.answers.roundIndex !== state.question.roundIndex) return state;
      return { ...state, answers: action.answers };
    }
    case 'reveal': {
      if (state.question && action.reveal.roundIndex !== state.question.roundIndex) return state;
      return { ...state, reveal: action.reveal, submitting: false };
    }
    case 'results':
      return { ...INITIAL, results: action.results };
    case 'submitting':
      return { ...state, submitting: action.submitting };
    case 'answered':
      return { ...state, myAnswer: action.receipt, submitting: false, error: null };
    case 'readied':
      return { ...state, readied: true };
    case 'error':
      return { ...state, error: action.error };
    case 'reset':
      return INITIAL;
    default:
      return state;
  }
}

export interface GameValue {
  intro: GameIntro | null;
  question: RoundQuestion | null;
  answers: RoundAnswerState | null;
  reveal: RoundReveal | null;
  results: MatchResults | null;
  myAnswer: AnswerReceipt | null;
  submitting: boolean;
  error: PlayverseError | null;
  readied: boolean;
  now: number;
  msLeft: number;
  answeredPlayerIds: readonly string[];
  markReady: () => Promise<Result<{ readyCount: number }>>;
  submitAnswer: (choiceId: string) => Promise<Result<AnswerReceipt>>;
  continueRound: () => Promise<Result<RoomState>>;
  rematch: () => Promise<Result<RoomState>>;
  returnToLobby: () => Promise<Result<RoomState>>;
  clearError: () => void;
  answeredIds: Set<string>;
  myAnswerId: string | null;
  meId: string | null;
}

const GameContext = createContext<GameValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { room, meId } = useRoom();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const meIdRef = useRef<string | undefined>(meId);

  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  const applyServerTime = useCallback((serverTime: number) => {
    offsetRef.current = serverTime - Date.now();
    setNow(Date.now() + offsetRef.current);
  }, []);

  useEffect(() => {
    if (typeof room?.serverTime === 'number') applyServerTime(room.serverTime);
  }, [room?.serverTime, applyServerTime]);

  useEffect(() => {
    const socket: PlayverseSocket = getSocket();

    const onIntro = (intro: GameIntro) => dispatch({ type: 'intro', intro });
    const onQuestion = (question: RoundQuestion) => dispatch({ type: 'question', question });
    const onAnswers = (answers: RoundAnswerState) => dispatch({ type: 'answers', answers });
    const onReveal = (reveal: RoundReveal) => dispatch({ type: 'reveal', reveal });
    const onResults = (results: MatchResults) => dispatch({ type: 'results', results });
    const onState = (next: RoomState) => {
      if (next.status === 'lobby') dispatch({ type: 'reset' });
    };

    socket.on('game:intro', onIntro);
    socket.on('round:start', onQuestion);
    socket.on('round:answers', onAnswers);
    socket.on('round:reveal', onReveal);
    socket.on('match:results', onResults);
    socket.on('room:state', onState);

    return () => {
      socket.off('game:intro', onIntro);
      socket.off('round:start', onQuestion);
      socket.off('round:answers', onAnswers);
      socket.off('round:reveal', onReveal);
      socket.off('match:results', onResults);
      socket.off('room:state', onState);
    };
  }, []);

  useEffect(() => {
    if (!room) dispatch({ type: 'reset' });
  }, [room]);

  const timerLive = Boolean(state.intro || state.question || state.reveal);
  useEffect(() => {
    if (!timerLive) return;
    setNow(Date.now() + offsetRef.current);
    const id = setInterval(() => setNow(Date.now() + offsetRef.current), 100);
    return () => clearInterval(id);
  }, [timerLive, state.intro?.startsAt, state.question?.endsAt, state.reveal?.nextAt]);

  const ask = useCallback(
    <T,>(
      emit: (socket: PlayverseSocket, resolve: (result: Result<T>) => void) => void,
      label: string,
    ): Promise<Result<T>> =>
      new Promise((resolve) => {
        const socket = getSocket();
        const timer = setTimeout(() => {
          resolve(err<T>('server-error', `The server did not answer ${label} — try again.`));
        }, ACK_TIMEOUT_MS);
        emit(socket, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
      }),
    [],
  );

  const inFlightAnswerRound = useRef<number | null>(null);

  const markReady = useCallback(
    async () => {
      const result = await ask<{ readyCount: number }>(
        (socket, resolve) => socket.emit('round:ready', resolve),
        'round:ready',
      );
      if (result.ok) dispatch({ type: 'readied' });
      else dispatch({ type: 'error', error: result.error });
      return result;
    },
    [ask],
  );

  const submitAnswer = useCallback(
    async (choiceId: string): Promise<Result<AnswerReceipt>> => {
      const question = state.question;
      if (!question) return err('wrong-phase', 'No round is running.');
      if (state.myAnswer) return err('duplicate-answer', 'You already answered.');
      if (inFlightAnswerRound.current === question.roundIndex) {
        return err('duplicate-answer', 'Your answer is already on its way.');
      }

      inFlightAnswerRound.current = question.roundIndex;
      dispatch({ type: 'submitting', submitting: true });

      const result = await ask<AnswerReceipt>(
        (socket, resolve) =>
          socket.emit(
            'game:answer',
            { roundIndex: question.roundIndex, choiceId },
            (ack: Result<AnswerReceipt>) => resolve(ack),
          ),
        'game:answer',
      );

      if (inFlightAnswerRound.current === question.roundIndex) {
        inFlightAnswerRound.current = null;
      }
      dispatch({ type: 'submitting', submitting: false });

      if (result.ok) {
        dispatch({ type: 'answered', receipt: result.data });
      } else if (result.error.code === 'duplicate-answer') {
        // The server already holds an answer (e.g. it arrived before a
        // reconnect). Lock this round locally instead of retrying forever.
        dispatch({
          type: 'answered',
          receipt: { choiceId, receivedAt: Date.now() },
        });
        dispatch({ type: 'error', error: null });
      } else {
        dispatch({ type: 'error', error: result.error });
      }

      return result;
    },
    [ask, state.question, state.myAnswer],
  );

  const continueRound = useCallback(
    () => ask<RoomState>((socket, resolve) => socket.emit('round:continue', resolve), 'round:continue'),
    [ask],
  );

  const rematch = useCallback(
    () => ask<RoomState>((socket, resolve) => socket.emit('match:rematch', resolve), 'match:rematch'),
    [ask],
  );

  const returnToLobby = useCallback(
    () => ask<RoomState>((socket, resolve) => socket.emit('match:lobby', resolve), 'match:lobby'),
    [ask],
  );

  const clearError = useCallback(() => dispatch({ type: 'error', error: null }), []);

  const msLeft = state.question ? Math.max(0, state.question.endsAt - now) : 0;
  const answeredPlayerIds = state.answers?.answeredPlayerIds ?? [];
  const answeredIds: Set<string> = new Set(answeredPlayerIds);
  if (meIdRef.current) answeredIds.add(meIdRef.current);
  const myAnswerId = state.myAnswer?.choiceId ?? null;

  const value = useMemo<GameValue>(
    () => ({
      intro: state.intro,
      question: state.question,
      answers: state.answers,
      reveal: state.reveal,
      results: state.results,
      myAnswer: state.myAnswer,
      submitting: state.submitting,
      readied: state.readied,
      error: state.error,
      now,
      msLeft,
      answeredPlayerIds,
      markReady,
      submitAnswer,
      continueRound,
      rematch,
      returnToLobby,
      clearError,
      answeredIds,
      myAnswerId,
      meId: meIdRef.current ?? null,
    }),
    [
      state,
      now,
      msLeft,
      answeredPlayerIds,
      markReady,
      submitAnswer,
      continueRound,
      rematch,
      returnToLobby,
      clearError,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside <GameProvider>');
  return value;
}

export function useGameViewModel(game: GameValue) {
  return game;
}

/** Seconds left, rounded up, for a timer label. */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}
