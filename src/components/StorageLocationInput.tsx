'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MerchantInput from './MerchantInput';
import type { MerchantOption } from '@/src/lib/catalog-shared';

export default function StorageLocationInput({ empresaId, locations, initialValue = '', name = 'location', disabled, onBusyChange }: {
  empresaId: string; locations: MerchantOption[]; initialValue?: string; name?: string;
  disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [created, setCreated] = useState<MerchantOption[]>([]);
  const options = [...locations, ...created.filter(item => !locations.some(location => location.id === item.id))];
  return <MerchantInput kind="storage" name={name} empresaId={empresaId} value={value} onChange={setValue}
    merchants={options} onCreated={item => { setCreated(current => [...current.filter(location => location.id !== item.id), item]); router.refresh(); }}
    disabled={disabled} onBusyChange={onBusyChange} />;
}
