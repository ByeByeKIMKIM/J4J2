<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { profile } from '../../stores/benefits';
    import ProgressBar from '$lib/components/ProgressBar.svelte';
    import EvidenceMemo from '$lib/components/EvidenceMemo.svelte';
    import { Send, User, Bot, AlertCircle, Loader2 } from 'lucide-svelte';
    import { goto } from '$app/navigation';
    
    // 1. Import useChat from the Svelte AI SDK
    import { useChat } from '@ai-sdk/svelte';

    // 2. Initialize useChat
    // This automatically manages the streaming state and messages array!
    const { messages, input, handleSubmit, isLoading, append } = useChat({
        api: '/api/chat',
        body: {
            state: $profile.state // Pass the applicant's state to the backend
        }
    });

    let chatContainer: HTMLElement | undefined = $state();

    onMount(async () => {
        if (!$profile.state) {
            goto('/');
            return;
        }

        // 3. Trigger the opening message from the AI when the component mounts
        const stateName = $profile.state === 'CA' ? 'California CalFresh' : 'New York SNAP';
        await append({
            role: 'user',
            content: `Hi, I am applying for ${stateName}. Can you guide me through the eligibility interview?`
        });
    });

    // Auto-scroll whenever messages change
    $effect(() => {
        if ($messages.length) {
            tick().then(() => {
                if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
            });
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Create a synthetic event to trigger handleSubmit
            const form = e.currentTarget?.closest('form');
            if (form) form.requestSubmit();
        }
    }
</script>

<div class="flex-1 flex flex-col h-[calc(100vh-73px)]">
    <ProgressBar />

    <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
        <!-- ── Chat Area ────────────────────────────────────────────────────── -->
        <div class="flex-1 flex flex-col {$profile.lowBandwidthMode ? 'bg-black' : 'bg-white'}">
            <div class="flex-1 p-4 overflow-y-auto" bind:this={chatContainer}>
                <div class="max-w-3xl mx-auto space-y-6">
                    {#each $messages as msg, i (i)}
                        {#if msg.role === 'system'}
                            <div class="flex justify-center">
                                <div class="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-gray-400">
                                    <AlertCircle size={14} />
                                    <span>{msg.content}</span>
                                </div>
                            </div>

                        {:else if msg.role === 'user'}
                            <div class="flex justify-end animate-fade-in-up">
                                <div class="max-w-[80%] rounded-2xl px-5 py-3
                                    {$profile.lowBandwidthMode
                                        ? 'bg-white text-black border border-white'
                                        : 'bg-blue-600 text-white shadow-md'}">
                                    <p class="text-[15px] leading-relaxed">{msg.content}</p>
                                </div>
                                <div class="w-8 h-8 rounded-full ml-3 flex items-center justify-center shrink-0
                                    {$profile.lowBandwidthMode
                                        ? 'border border-white bg-black'
                                        : 'bg-blue-100 text-blue-600'}">
                                    <User size={16} />
                                </div>
                            </div>

                        {:else}
                            <div class="flex justify-start animate-fade-in-up">
                                <div class="w-8 h-8 rounded-full mr-3 flex items-center justify-center shrink-0
                                    {$profile.lowBandwidthMode
                                        ? 'border border-white bg-black'
                                        : 'bg-gray-100 text-gray-600'}">
                                    <Bot size={16} />
                                </div>
                                <div class="max-w-[80%] rounded-2xl px-5 py-3
                                    {$profile.lowBandwidthMode
                                        ? 'border border-white text-white'
                                        : 'bg-gray-100 text-gray-800'}">
                                    <p class="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>

            <!-- ── Input ───────────────────────────────────────────────────── -->
            <div class="p-4 border-t
                {$profile.lowBandwidthMode
                    ? 'bg-black border-white'
                    : 'bg-white border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]'}">
                <form onsubmit={handleSubmit} class="max-w-3xl mx-auto flex gap-2">
                    <textarea
                        rows="1"
                        bind:value={$input}
                        onkeydown={handleKeydown}
                        placeholder="Type your answer and press Enter…"
                        class="flex-1 rounded-xl px-4 py-3 outline-none transition-all resize-none leading-relaxed
                            {$profile.lowBandwidthMode
                                ? 'bg-black border-2 border-white text-white placeholder-gray-500 focus:border-white focus:bg-white focus:text-black'
                                : 'bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}"
                        disabled={$isLoading}
                    ></textarea>
                    <button
                        type="submit"
                        disabled={$isLoading || !$input.trim()}
                        class="rounded-xl px-4 flex items-center justify-center transition-all disabled:opacity-50
                            {$profile.lowBandwidthMode
                                ? 'border-2 border-white bg-black hover:bg-white hover:text-black disabled:hover:bg-black disabled:hover:text-white text-white'
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}"
                    >
                        {#if $isLoading}
                            <Loader2 size={20} class="animate-spin" />
                        {:else}
                            <Send size={20} />
                        {/if}
                    </button>
                </form>
            </div>
        </div>

        <!-- ── Evidence Memo Panel (Desktop) ──────────────────────────────── -->
        <div class="hidden md:block w-[400px] shrink-0 border-l
            {$profile.lowBandwidthMode ? 'border-white' : 'border-gray-200'}">
            <EvidenceMemo />
        </div>
    </div>
</div>

<style>
    .animate-fade-in-up {
        animation: fadeInUp 0.3s ease-out forwards;
    }
    @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
</style>
