"use client";
import { useState } from "react";
import StockMovementPanel from "./StockMovementPanel";
import { quantityLabel, type StockProduct, type MoveStockResult } from "@/lib/xpace/stock";

export default function StockSizeMovementPanel({ product, onDone, onCancel, onLockChange }: {
  product: StockProduct; onDone: (result: MoveStockResult) => void; onCancel: () => void;
  onLockChange?: (locked: boolean) => void;
}) {
  const [selected, setSelected] = useState<StockProduct | null>(null);
  if (!product.hasVariants) return <StockMovementPanel product={product} onDone={onDone} onCancel={onCancel} onLockChange={onLockChange} />;
  if (selected) return <StockMovementPanel key={selected.id} product={selected} onDone={onDone} onCancel={() => setSelected(null)} onLockChange={onLockChange} />;
  const sizes = product.variants?.filter(size => size.active && size.sizeEnabled !== false) ?? [];
  return <section className="xs-form">
    <h3>{product.description}</h3>
    <p>ESCOLHA O TAMANHO PARA ENTRADA OU BAIXA. CADA TAMANHO TEM SEU PRÓPRIO SALDO.</p>
    <div className="xs-size-options" role="group" aria-label="Escolher tamanho">
      {sizes.map(size => <button key={size.id} type="button" className="xs-secondary" onClick={() => setSelected(size)}>
        <strong>{size.sizeLabel}</strong><span>{quantityLabel(size.stockQuantity)} {size.unitAbbreviation}</span>
        {!size.stockQuantity ? <small>SEM SALDO · ENTRADA DISPONÍVEL</small> : null}
      </button>)}
    </div>
    {!sizes.length ? <p className="xs-error" role="alert">NENHUM TAMANHO ATIVO. PEÇA AO GESTOR PARA CONFERIR A GRADE.</p> : null}
    <button type="button" className="xs-secondary" onClick={onCancel}>CANCELAR / OUTRO PRODUTO</button>
  </section>;
}
