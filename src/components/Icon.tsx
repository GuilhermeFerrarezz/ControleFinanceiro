import type { CSSProperties } from 'react';
const paths = {
  edit: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  arrow: 'M4 12h15m-6-6 6 6-6 6', check: 'm5 12 4 4L19 6',
  chart: 'M4 20V10m8 10V4m8 16v-7', team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75',
  leaf: 'M20 4C6 2 2 10 6 16s16 5 14-12ZM4 21 16 9',
  store: 'M3 10h18L19 3H5l-2 7Zm1 0v11h16V10M9 21v-7h6v7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0',
  shield: 'm12 3 9 4v5c0 5-9 9-9 9S3 17 3 12V7l9-4Zm-4 9 3 3 5-6',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  mail: 'M3 5h18v14H3V5Zm0 1 9 7 9-7', close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 4v16M4 12h16', logout: 'M9 3H4v18h5m5-14 5 5-5 5m-6-5h13',
  receipt: 'M5 3h14v19l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3',
};
export default function Icon({ name, size = 22, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
