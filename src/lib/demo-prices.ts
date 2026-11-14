import { normalizeCatalogName } from './catalog-shared';
import { daysBetween } from './expense-shared';

// An eleven-day cycle also varies products purchased once a week.
const movements = [0, 1400, -600, 900, -1300, 400, -800, 1600, -300, 700, -1000];
const seasons = [0, 200, -300, 400, 100, -200, 500, 0, -100, 300, -200, 100];

export function demoUnitPrice(baseCents: number, productName: string, date: string) {
  const offset = [...normalizeCatalogName(productName)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const day = daysBetween(`${date.slice(0,4)}-01-01`, date) - 1;
  const month = Number(date.slice(5,7)) - 1;
  const basisPoints = 10000 + month * 150 + seasons[month] + movements[(day + offset) % movements.length];
  return Math.max(1, Math.round(baseCents * basisPoints / 10000));
}
