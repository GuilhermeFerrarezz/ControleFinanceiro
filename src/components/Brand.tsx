import Link from 'next/link';
import Image from 'next/image';
export default function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand${light ? ' brand-light' : ''}`} aria-label="Saldo da Casa — página inicial"><span className="brand-symbol"><Image src="/branding/saldo-da-casa.png" width={64} height={64} alt="" /></span><span>Saldo<span className="brand-second">da Casa</span></span></Link>;
}
