<script lang="ts">
    import { profile } from '../../stores/benefits';
    import { CheckCircle2, Circle } from 'lucide-svelte';

    const steps = [
        { id: 0, label: 'Location Found' },
        { id: 1, label: 'Income Verified' },
        { id: 2, label: 'Deductions Calculated' },
        { id: 3, label: 'Evidence Generated' }
    ];
</script>

<div class="w-full py-4 overflow-x-auto { $profile.lowBandwidthMode ? 'border-b border-white' : '' }">
    <div class="flex items-center justify-between min-w-[500px] px-4">
        {#each steps as step, i}
            <div class="flex items-center gap-2">
                {#if $profile.logicStep > step.id}
                    <CheckCircle2 size={20} class="{ $profile.lowBandwidthMode ? 'text-white' : 'text-green-500' }" />
                    <span class="text-sm font-medium { $profile.lowBandwidthMode ? 'text-white' : 'text-gray-900' }">{step.label}</span>
                {:else if $profile.logicStep === step.id}
                    <Circle size={20} class="{ $profile.lowBandwidthMode ? 'text-white' : 'text-blue-500' } animate-pulse" />
                    <span class="text-sm font-bold { $profile.lowBandwidthMode ? 'text-white' : 'text-blue-600' }">{step.label}</span>
                {:else}
                    <Circle size={20} class="{ $profile.lowBandwidthMode ? 'text-gray-500' : 'text-gray-300' }" />
                    <span class="text-sm { $profile.lowBandwidthMode ? 'text-gray-500' : 'text-gray-400' }">{step.label}</span>
                {/if}
            </div>
            {#if i < steps.length - 1}
                <div class="flex-1 h-px mx-4 { $profile.lowBandwidthMode ? 'bg-gray-500' : 'bg-gray-200' }"></div>
            {/if}
        {/each}
    </div>
</div>
