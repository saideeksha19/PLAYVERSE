export interface MemorySymbol {
  id: string;
  label: string;
  symbol: string;
}

/** Display metadata for Memory Mix symbols; ids come from the server rules. */
export const MEMORY_SYMBOLS: readonly MemorySymbol[] = [
  { id: 'star', label: 'Star', symbol: '★' },
  { id: 'heart', label: 'Heart', symbol: '♥' },
  { id: 'diamond', label: 'Diamond', symbol: '◆' },
  { id: 'circle', label: 'Circle', symbol: '●' },
  { id: 'triangle', label: 'Triangle', symbol: '▲' },
  { id: 'square', label: 'Square', symbol: '■' },
  { id: 'bolt', label: 'Bolt', symbol: '⚡' },
  { id: 'moon', label: 'Moon', symbol: '☾' },
  { id: 'sun', label: 'Sun', symbol: '☀' },
  { id: 'leaf', label: 'Leaf', symbol: '🍃' },
];

export function memorySymbol(id: string): MemorySymbol {
  return MEMORY_SYMBOLS.find((entry) => entry.id === id) ?? { id, label: id, symbol: id };
}

export function memorySequenceLabel(choiceId: string): string {
  return choiceId
    .split(',')
    .filter(Boolean)
    .map((id) => memorySymbol(id).label)
    .join(' → ');
}
