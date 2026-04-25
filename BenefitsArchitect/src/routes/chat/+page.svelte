<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { profile } from '../../stores/benefits';
    import ProgressBar from '$lib/components/ProgressBar.svelte';
    import EvidenceMemo from '$lib/components/EvidenceMemo.svelte';
    import { Send, User, Bot, AlertCircle, Loader2 } from 'lucide-svelte';
    import { goto } from '$app/navigation';

    // ─── Types ────────────────────────────────────────────────────────────────
    interface ChatMessage {
        role: 'user' | 'assistant' | 'system';
        content: string;
        streaming?: boolean;
    }

    // ─── State ────────────────────────────────────────────────────────────────
    let messages = $state<ChatMessage[]>([
        { role: 'system', content: 'Agent A (Analyst) initialized. RAG mode active.' }
    ]);
    let inputValue = $state('');
    let isStreaming = $state(false);
    let chatContainer: HTMLElement | undefined = $state();

    // Full conversation history sent to the server each turn
    let conversationHistory = $state<Array<{ role: string; content: string }>>([]);

    onMount(async () => {
        if (!$profile.state) {
            goto('/');
            return;
        }

        const greeting =
            $profile.state === 'CA'
                ? "Hello! I'm your eligibility analyst for California CalFresh. I'll guide you through a brief interview and verify each rule directly against the official state policy manual."
                : "Hello! I'm your eligibility analyst for New York SNAP. I'll guide you through a brief interview and verify each rule directly against the official state policy manual.";
        const opening =
            'First, including yourself, how many people live and buy/prepare food together in your household?';

        messages = [
            ...messages,
            { role: 'assistant', content: greeting },
            { role: 'assistant', content: opening }
        ];

        // Pre-seed conversation history
        conversationHistory = [{ role: 'assistant', content: greeting + ' ' + opening }];
    });

    async function scrollToBottom() {
        await tick();
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // ─── Send Message ─────────────────────────────────────────────────────────
    async function sendMessage() {
        if (!inputValue.trim() || isStreaming) return;

        const userText = inputValue.trim();
        inputValue = '';

        messages = [...messages, { role: 'user', content: userText }];
        conversationHistory = [...conversationHistory, { role: 'user', content: userText }];
        await scrollToBottom();

        isStreaming = true;

        // Add a streaming placeholder bubble
        let streamingIdx = messages.length;
        messages = [...messages, { role: 'assistant', content: '', streaming: true }];
        await scrollToBottom();

        // Track pending tool calls by toolCallId so we can match results
        const pendingToolCalls: Map<string, string> = new Map(); // toolCallId -> query
        let fullText = '';

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: conversationHistory,
                    state: $profile.state
                })
            });

            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                // Keep incomplete last line in buffer
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    let chunk: Record<string, unknown>;
                    try {
                        chunk = JSON.parse(trimmed);
                    } catch {
                        continue;
                    }

                    const type = chunk.type as string;

                    // ── Text streaming ─────────────────────────────────────
                    if (type === 'text-delta') {
                        fullText += (chunk.delta as string) ?? '';
                        messages = messages.map((m, i) =>
                            i === streamingIdx ? { ...m, content: fullText } : m
                        );
                        if (!$profile.lowBandwidthMode) await scrollToBottom();

                    // ── Tool call started ──────────────────────────────────
                    } else if (type === 'tool-input-available') {
                        const toolCallId = chunk.toolCallId as string;
                        const toolName = chunk.toolName as string;
                        const input = chunk.input as { query?: string; state?: string } | undefined;

                        if (toolName === 'search_policy_manual') {
                            const query = input?.query ?? '';
                            pendingToolCalls.set(toolCallId, query);

                            // Add a "searching" placeholder Evidence Card
                            profile.update(p => ({
                                ...p,
                                evidence: [
                                    ...p.evidence,
                                    {
                                        id: toolCallId,
                                        step: `Searching: ${input?.state ?? $profile.state}`,
                                        text: '⏳ Retrieving policy excerpt…',
                                        source: 'Policy Manual',
                                        query
                                    }
                                ]
                            }));
                        }

                    // ── Tool result returned ───────────────────────────────
                    } else if (type === 'tool-output-available') {
                        const toolCallId = chunk.toolCallId as string;
                        const output = chunk.output as {
                            found?: boolean;
                            chunks?: Array<{ text: string; source: string; rank: number; score: number }>;
                            state?: string;
                            query?: string;
                            message?: string;
                        };
                        const query = pendingToolCalls.get(toolCallId) ?? '';

                        if (output?.found && output.chunks && output.chunks.length > 0) {
                            const top = output.chunks[0];
                            profile.update(p => ({
                                ...p,
                                evidence: p.evidence.map(e =>
                                    e.id === toolCallId
                                        ? {
                                              ...e,
                                              step: `Policy Retrieved (${output.state ?? $profile.state})`,
                                              text: top.text,
                                              source: top.source,
                                              rank: top.rank,
                                              score: top.score,
                                              query
                                          }
                                        : e
                                )
                            }));
                        } else {
                            profile.update(p => ({
                                ...p,
                                evidence: p.evidence.map(e =>
                                    e.id === toolCallId
                                        ? {
                                              ...e,
                                              step: 'Policy Search',
                                              text:
                                                  output?.message ??
                                                  'No matching policy text found. Run the ingestion script first.',
                                              source: 'N/A',
                                              query
                                          }
                                        : e
                                )
                            }));
                        }

                    } else if (type === 'error') {
                        console.error('Stream error:', chunk.errorText);
                    }
                }
            }

            // Finalize
            messages = messages.map((m, i) =>
                i === streamingIdx ? { ...m, streaming: false, content: fullText } : m
            );

            if (fullText) {
                conversationHistory = [
                    ...conversationHistory,
                    { role: 'assistant', content: fullText }
                ];
            }

            // Advance logic step
            profile.update(p => {
                const newStep = Math.min(p.logicStep + 1, 4);
                const np = { ...p, logicStep: newStep };
                if (p.logicStep === 0) np.householdSize = parseInt(userText) || null;
                if (p.logicStep === 1) np.monthlyIncome = parseInt(userText) || null;
                if (p.logicStep === 2) np.housingCosts = parseInt(userText) || null;
                if (p.logicStep === 3) np.hasUtilityBills = /\byes\b|^y$/i.test(userText);
                return np;
            });
        } catch (e) {
            messages = messages.map((m, i) =>
                i === streamingIdx
                    ? {
                          role: 'system',
                          content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
                          streaming: false
                      }
                    : m
            );
        } finally {
            isStreaming = false;
            await scrollToBottom();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
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
                    {#each messages as msg, i (i)}
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
                                    {#if msg.streaming}
                                        <Loader2 size={16} class="animate-spin" />
                                    {:else}
                                        <Bot size={16} />
                                    {/if}
                                </div>
                                <div class="max-w-[80%] rounded-2xl px-5 py-3
                                    {$profile.lowBandwidthMode
                                        ? 'border border-white text-white'
                                        : 'bg-gray-100 text-gray-800'}">
                                    {#if msg.streaming && !msg.content && !$profile.lowBandwidthMode}
                                        <!-- Typing indicator while waiting for first token -->
                                        <div class="flex gap-1 py-1">
                                            <div class="w-2 h-2 rounded-full animate-bounce
                                                {$profile.lowBandwidthMode ? 'bg-white' : 'bg-gray-400'}"
                                                style="animation-delay: 0ms"></div>
                                            <div class="w-2 h-2 rounded-full animate-bounce
                                                {$profile.lowBandwidthMode ? 'bg-white' : 'bg-gray-400'}"
                                                style="animation-delay: 150ms"></div>
                                            <div class="w-2 h-2 rounded-full animate-bounce
                                                {$profile.lowBandwidthMode ? 'bg-white' : 'bg-gray-400'}"
                                                style="animation-delay: 300ms"></div>
                                        </div>
                                    {:else}
                                        <p class="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}{#if msg.streaming && !$profile.lowBandwidthMode}<span class="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle"></span>{/if}</p>
                                    {/if}
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
                <div class="max-w-3xl mx-auto flex gap-2">
                    {#if $profile.logicStep < 4}
                        <textarea
                            rows="1"
                            bind:value={inputValue}
                            onkeydown={handleKeydown}
                            placeholder="Type your answer and press Enter…"
                            class="flex-1 rounded-xl px-4 py-3 outline-none transition-all resize-none leading-relaxed
                                {$profile.lowBandwidthMode
                                    ? 'bg-black border-2 border-white text-white placeholder-gray-500 focus:border-white focus:bg-white focus:text-black'
                                    : 'bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}"
                            disabled={isStreaming}
                        ></textarea>
                        <button
                            type="button"
                            onclick={sendMessage}
                            disabled={isStreaming || !inputValue.trim()}
                            class="rounded-xl px-4 flex items-center justify-center transition-all disabled:opacity-50
                                {$profile.lowBandwidthMode
                                    ? 'border-2 border-white bg-black hover:bg-white hover:text-black disabled:hover:bg-black disabled:hover:text-white text-white'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}"
                        >
                            {#if isStreaming}
                                <Loader2 size={20} class="animate-spin" />
                            {:else}
                                <Send size={20} />
                            {/if}
                        </button>
                    {:else}
                        <button
                            type="button"
                            onclick={() => goto('/submission')}
                            class="w-full rounded-xl py-4 font-bold text-lg transition-all
                                {$profile.lowBandwidthMode
                                    ? 'border-2 border-white bg-black text-white hover:bg-white hover:text-black'
                                    : 'bg-green-600 text-white hover:bg-green-700 shadow-md'}"
                        >
                            View Submission Bundle →
                        </button>
                    {/if}
                </div>
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
