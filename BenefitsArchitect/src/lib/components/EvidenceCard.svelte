<script lang="ts">
    import { CheckCircle, Search, TrendingUp } from 'lucide-svelte';
    import { profile } from '../../stores/benefits';
    import type { EvidenceItem } from '../../stores/benefits';

    let { step, text, source, query, rank, score }: EvidenceItem = $props();

    const isRagCard = !!query;
    const confidencePct = score != null ? Math.round(score * 100) : null;
</script>

<div class="p-4 rounded-xl border mb-3 transition-all duration-200
    {$profile.lowBandwidthMode
        ? 'bg-black border-white text-white'
        : isRagCard
            ? 'bg-white shadow-sm hover:shadow-md border-blue-100'
            : 'bg-white shadow-sm hover:shadow-md border-gray-100'}">

    <!-- Header -->
    <div class="flex items-start gap-2 mb-2">
        {#if isRagCard}
            <Search size={15} class="{$profile.lowBandwidthMode ? 'text-white' : 'text-blue-500'} shrink-0 mt-0.5" />
        {:else}
            <CheckCircle size={15} class="{$profile.lowBandwidthMode ? 'text-white' : 'text-green-500'} shrink-0 mt-0.5" />
        {/if}
        <div class="flex-1 min-w-0">
            <span class="text-xs font-bold tracking-wider uppercase block truncate
                {$profile.lowBandwidthMode ? 'text-gray-300' : 'text-gray-500'}">
                {step}
            </span>
            {#if isRagCard && query}
                <span class="text-xs italic mt-0.5 block truncate
                    {$profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-400'}">
                    Query: "{query}"
                </span>
            {/if}
        </div>
        {#if confidencePct != null}
            <div class="flex items-center gap-1 shrink-0">
                <TrendingUp size={11} class="{$profile.lowBandwidthMode ? 'text-gray-400' : 'text-blue-400'}" />
                <span class="text-xs font-semibold {$profile.lowBandwidthMode ? 'text-gray-400' : 'text-blue-500'}">
                    {confidencePct}%
                </span>
            </div>
        {/if}
    </div>

    <!-- Excerpt -->
    <blockquote class="text-sm leading-relaxed mb-3 pl-3 border-l-2 italic
        {$profile.lowBandwidthMode ? 'text-white border-gray-500' : 'text-gray-800 border-blue-200'}">
        {text.length > 300 ? text.slice(0, 300) + '…' : text}
    </blockquote>

    <!-- Source badge -->
    <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="inline-block px-2 py-1 rounded text-xs font-medium
            {$profile.lowBandwidthMode ? 'border border-white text-white' : 'bg-blue-50 text-blue-800 border border-blue-100'}">
            📄 {source}
        </div>
        {#if rank != null}
            <span class="text-xs {$profile.lowBandwidthMode ? 'text-gray-500' : 'text-gray-400'}">
                Match #{rank}
            </span>
        {/if}
    </div>
</div>
