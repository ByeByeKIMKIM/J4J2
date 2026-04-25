<script lang="ts">
    import { profile } from '../../stores/benefits';
    import EvidenceCard from './EvidenceCard.svelte';
    import { FileText } from 'lucide-svelte';
</script>

<div class="h-full flex flex-col { $profile.lowBandwidthMode ? 'bg-black text-white border-l border-white' : 'bg-gray-50 border-l border-gray-200' }">
    <div class="p-6 border-b { $profile.lowBandwidthMode ? 'border-white' : 'border-gray-200' }">
        <div class="flex items-center gap-2 mb-2">
            <FileText size={24} class="{ $profile.lowBandwidthMode ? 'text-white' : 'text-blue-600' }" />
            <h2 class="text-xl font-bold { $profile.lowBandwidthMode ? 'text-white' : 'text-gray-900' }">Drafting Legal Justification</h2>
        </div>
        <p class="text-sm { $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">
            Compiling evidence for { $profile.state === 'CA' ? 'CalFresh' : 'SNAP' } eligibility based on state manuals.
        </p>
    </div>

    <div class="flex-1 p-6 overflow-y-auto">
        {#if $profile.evidence.length === 0}
            <div class="flex flex-col items-center justify-center h-full text-center opacity-50">
                <FileText size={48} class="mb-4" />
                <p>Waiting for interview data...</p>
            </div>
        {:else}
            <div class="space-y-4">
                {#each $profile.evidence as item (item.id)}
                    <div class="animate-fade-in">
                        <EvidenceCard id={item.id} step={item.step} text={item.text} source={item.source} query={item.query} rank={item.rank} score={item.score} />
                    </div>
                {/each}
                {#if $profile.logicStep < 4}
                    <div class="flex items-center gap-3 p-4 rounded-xl border border-dashed { $profile.lowBandwidthMode ? 'border-gray-500 text-gray-500' : 'border-gray-300 text-gray-400 bg-white/50' }">
                        <div class="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin { $profile.lowBandwidthMode ? 'border-gray-500' : 'border-gray-400' }"></div>
                        <span class="text-sm">Analyst is checking state law...</span>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .animate-fade-in {
        animation: fadeIn 0.5s ease-out forwards;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
