<script lang="ts">
    import { profile } from '../../stores/benefits';
    import { ShieldAlert, Wifi, WifiOff } from 'lucide-svelte';

    function toggleBandwidth() {
        profile.update(p => ({ ...p, lowBandwidthMode: !p.lowBandwidthMode }));
    }

    function selfDestruct() {
        profile.selfDestruct();
        window.location.href = '/';
    }
</script>

<header class="flex justify-between items-center p-4 border-b { $profile.lowBandwidthMode ? 'bg-black text-white border-white' : 'bg-white shadow-sm' }">
    <div class="flex items-center gap-2">
        <div class="font-bold text-xl tracking-tight { $profile.lowBandwidthMode ? 'text-white' : 'text-blue-600' }">
            Benefits Architect
        </div>
    </div>
    
    <div class="flex items-center gap-4">
        <button 
            on:click={toggleBandwidth}
            class="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full transition-colors { $profile.lowBandwidthMode ? 'border border-white hover:bg-white hover:text-black' : 'bg-gray-100 hover:bg-gray-200 text-gray-700' }"
            title="Toggle Low Bandwidth Mode"
        >
            {#if $profile.lowBandwidthMode}
                <WifiOff size={16} />
                <span>Basic Mode</span>
            {:else}
                <Wifi size={16} />
                <span>3G/Edge Mode</span>
            {/if}
        </button>

        <button 
            on:click={selfDestruct}
            class="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors { $profile.lowBandwidthMode ? 'border border-white !bg-black !text-white hover:!bg-white hover:!text-black' : '' }"
            title="Clear all local state and session storage"
        >
            <ShieldAlert size={16} />
            <span class="hidden sm:inline">Self-Destruct Session</span>
        </button>
    </div>
</header>
