<script lang="ts">
    import './layout.css';
    import Header from '$lib/components/Header.svelte';
    import { profile } from '../stores/benefits';

    let { children } = $props();
</script>

<svelte:head>
    <title>Benefits Architect</title>
</svelte:head>

<div class="min-h-screen flex flex-col { $profile.lowBandwidthMode ? 'bg-black text-white font-mono' : 'bg-gray-50 font-sans' }">
    <Header />
    <main class="flex-1 flex flex-col">
        {@render children()}
    </main>
</div>
