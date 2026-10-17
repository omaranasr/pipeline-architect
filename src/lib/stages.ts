import type { StageName } from '../../shared/types.ts'

export const STAGE_INFO: Record<StageName, { name: string; color: string; text: string; bg: string; border: string }> = {
  IF: { name: 'Instruction Fetch', color: '#22d3ee', text: 'text-st-if', bg: 'bg-st-if/15', border: 'border-st-if/50' },
  ID: { name: 'Decode & Register Read', color: '#60a5fa', text: 'text-st-id', bg: 'bg-st-id/15', border: 'border-st-id/50' },
  EX: { name: 'Execute', color: '#fbbf24', text: 'text-st-ex', bg: 'bg-st-ex/15', border: 'border-st-ex/50' },
  MEM: { name: 'Memory Access', color: '#e879f9', text: 'text-st-mem', bg: 'bg-st-mem/15', border: 'border-st-mem/50' },
  WB: { name: 'Write Back', color: '#34d399', text: 'text-st-wb', bg: 'bg-st-wb/15', border: 'border-st-wb/50' },
}

export const STALL_COLOR = '#fb7185'
export const FWD_COLOR = '#f97316'
