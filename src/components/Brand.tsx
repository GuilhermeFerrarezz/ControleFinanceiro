import Link from 'next/link';
import Icon from './Icon';
export default function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="Controle Financeiro — página inicial"><span className="brand-symbol"><Icon name="chart" size={23} /></span><span>controle<span className="brand-second">financeiro<span className="brand-dot">.</span></span></span></Link>;
}
