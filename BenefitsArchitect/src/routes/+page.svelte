<script lang="ts">
    import { profile } from '../stores/benefits';
    import type { StateSelection } from '../stores/benefits';
    import { goto } from '$app/navigation';
    import { MapPin, ArrowRight } from 'lucide-svelte';

    function selectState(state: StateSelection) {
        profile.update(p => ({ ...p, state }));
        goto('/chat');
    }
</script>

<div class="flex-1 flex items-center justify-center p-4">
    <div class="max-w-xl w-full">
        <div class="text-center mb-10 animate-fade-in-up">
            <h1 class="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight { $profile.lowBandwidthMode ? 'text-white' : 'bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600' }">
                Verify Your Benefits
            </h1>
            <p class="text-lg { $profile.lowBandwidthMode ? 'text-gray-300' : 'text-gray-600' }">
                Get a legal determination for CalFresh or SNAP in minutes. No data is stored on our servers.
            </p>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
            <button 
                on:click={() => selectState('CA')}
                class="group flex flex-col items-center p-8 rounded-2xl border-2 transition-all { $profile.lowBandwidthMode ? 'border-white bg-black hover:bg-white hover:text-black' : 'border-blue-100 bg-white hover:border-blue-500 hover:shadow-xl' }"
            >
                <div class="w-16 h-16 rounded-full flex items-center justify-center mb-4 { $profile.lowBandwidthMode ? 'border border-current' : 'bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform' }">
                    <MapPin size={32} />
                </div>
                <h3 class="text-2xl font-bold mb-2">California</h3>
                <p class="text-sm text-center mb-4 { $profile.lowBandwidthMode ? 'opacity-80' : 'text-gray-500' }">CalFresh Eligibility</p>
                <div class="mt-auto flex items-center gap-2 font-medium { $profile.lowBandwidthMode ? '' : 'text-blue-600' }">
                    <span>Start</span>
                    <ArrowRight size={16} />
                </div>
            </button>

            <button 
                on:click={() => selectState('NY')}
                class="group flex flex-col items-center p-8 rounded-2xl border-2 transition-all { $profile.lowBandwidthMode ? 'border-white bg-black hover:bg-white hover:text-black' : 'border-indigo-100 bg-white hover:border-indigo-500 hover:shadow-xl' }"
            >
                <div class="w-16 h-16 rounded-full flex items-center justify-center mb-4 { $profile.lowBandwidthMode ? 'border border-current' : 'bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform' }">
                    <MapPin size={32} />
                </div>
                <h3 class="text-2xl font-bold mb-2">New York</h3>
                <p class="text-sm text-center mb-4 { $profile.lowBandwidthMode ? 'opacity-80' : 'text-gray-500' }">SNAP Eligibility</p>
                <div class="mt-auto flex items-center gap-2 font-medium { $profile.lowBandwidthMode ? '' : 'text-indigo-600' }">
                    <span>Start</span>
                    <ArrowRight size={16} />
                </div>
            </button>
        </div>
    </div>
</div>

<style>
    .animate-fade-in-up {
        animation: fadeInUp 0.6s ease-out forwards;
    }
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
