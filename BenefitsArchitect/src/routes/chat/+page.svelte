<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { profile } from '../../stores/benefits';
    import ProgressBar from '$lib/components/ProgressBar.svelte';
    import EvidenceMemo from '$lib/components/EvidenceMemo.svelte';
    import { Send, User, Bot, AlertCircle, Loader2 } from 'lucide-svelte';
    import { goto } from '$app/navigation';

    type ChatMessage = {
        role: 'system' | 'user' | 'assistant';
        content: string;
    };

    type InterviewState = {
        householdSize: number | null;
        grossIncome: number | null;
        housingCosts: number | null;
        paysHeatingOrCoolingSeparately: boolean | null;
        isComplete: boolean;
    };

    type SubmissionBundle = {
        finalDetermination: string;
        prefilledApplication: string;
        evidenceMemo: string;
        checklist: string[];
    };

    let messages = $state<ChatMessage[]>([]);
    let input = $state('');
    let isLoading = $state(false);
    let bundle = $state<SubmissionBundle | null>(null);

    let chatContainer: HTMLElement | undefined = $state();

    onMount(async () => {
        if (!$profile.state) {
            goto('/');
            return;
        }

        const stateName = $profile.state === 'CA' ? 'California CalFresh' : 'New York SNAP';
        await sendMessage(`Hi, I am applying for ${stateName}. Can you guide me through the eligibility interview?`);
    });

    // Auto-scroll whenever messages change
    $effect(() => {
        if (messages.length) {
            tick().then(() => {
                if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
            });
        }
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Create a synthetic event to trigger handleSubmit
            const form = (e.currentTarget as HTMLElement | null)?.closest('form');
            if (form) form.requestSubmit();
        }
    }

    async function sendMessage(content: string) {
        const trimmed = content.trim();
        if (!trimmed || isLoading) return;

        messages = [...messages, { role: 'user', content: trimmed }];
        isLoading = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state: $profile.state,
                    messages: messages.map((msg) => ({ role: msg.role, content: msg.content }))
                })
            });

            if (!response.ok) {
                throw new Error(`Chat request failed with status ${response.status}`);
            }

            const data = (await response.json()) as {
                message?: string;
                usedPolicySearch?: boolean;
                interview?: InterviewState;
                completionPercent?: number;
                bundle?: SubmissionBundle | null;
            };
            const assistantText = data.message?.trim() || 'I could not generate a response. Please try again.';
            messages = [...messages, { role: 'assistant', content: assistantText }];

            if (data.interview) {
                const interview = data.interview;
                profile.update((p) => ({
                    ...p,
                    householdSize: interview.householdSize ?? p.householdSize,
                    grossIncome: interview.grossIncome ?? p.grossIncome,
                    rentMortgage: interview.housingCosts ?? p.rentMortgage,
                    utilityType:
                        interview.paysHeatingOrCoolingSeparately === null
                            ? p.utilityType
                            : interview.paysHeatingOrCoolingSeparately
                                ? 'Heating/Cooling'
                                : 'None',
                    logicStep: Math.max(0, Math.min(3, Math.floor((data.completionPercent ?? 0) / 25))),
                    interviewComplete: interview.isComplete
                }));
            }

            if (data.bundle) {
                bundle = data.bundle;
                profile.update((p) => ({
                    ...p,
                    finalDetermination: data.bundle?.finalDetermination ?? p.finalDetermination,
                    evidenceMemo: data.bundle?.evidenceMemo ?? p.evidenceMemo,
                    prefilledApplication: data.bundle?.prefilledApplication ?? p.prefilledApplication,
                    requiredDocuments: data.bundle?.checklist ?? p.requiredDocuments,
                    logicStep: 4,
                    interviewComplete: true
                }));
            }

            if (!data.usedPolicySearch) {
                messages = [
                    ...messages,
                    {
                        role: 'system',
                        content: 'Warning: No policy match was found in the vector DB for that turn.'
                    }
                ];
            }
        } catch (error) {
            console.error('Chat request error:', error);
            messages = [
                ...messages,
                { role: 'system', content: 'Chat service is temporarily unavailable. Please try again.' }
            ];
        } finally {
            isLoading = false;
        }
    }

    async function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        const text = input;
        input = '';
        await sendMessage(text);
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
                        bind:value={input}
                        onkeydown={handleKeydown}
                        placeholder="Type your answer and press Enter…"
                        class="flex-1 rounded-xl px-4 py-3 outline-none transition-all resize-none leading-relaxed
                            {$profile.lowBandwidthMode
                                ? 'bg-black border-2 border-white text-white placeholder-gray-500 focus:border-white focus:bg-white focus:text-black'
                                : 'bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}"
                        disabled={isLoading}
                    ></textarea>
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        class="rounded-xl px-4 flex items-center justify-center transition-all disabled:opacity-50
                            {$profile.lowBandwidthMode
                                ? 'border-2 border-white bg-black hover:bg-white hover:text-black disabled:hover:bg-black disabled:hover:text-white text-white'
                                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}"
                    >
                        {#if isLoading}
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

    {#if bundle}
        <div class="border-t px-4 py-6 {$profile.lowBandwidthMode ? 'border-white bg-black text-white' : 'border-gray-200 bg-gray-50'}">
            <div class="max-w-3xl mx-auto space-y-4">
                <h3 class="text-lg font-bold">Submission-Ready Bundle</h3>
                <div class="rounded-xl p-4 {$profile.lowBandwidthMode ? 'border border-white' : 'bg-white border border-gray-200'}">
                    <p class="text-sm font-semibold mb-2">Final Determination</p>
                    <p class="text-sm whitespace-pre-wrap">{bundle.finalDetermination}</p>
                </div>
                <div class="rounded-xl p-4 {$profile.lowBandwidthMode ? 'border border-white' : 'bg-white border border-gray-200'}">
                    <p class="text-sm font-semibold mb-2">Pre-filled Application</p>
                    <pre class="text-xs whitespace-pre-wrap">{bundle.prefilledApplication}</pre>
                </div>
                <div class="rounded-xl p-4 {$profile.lowBandwidthMode ? 'border border-white' : 'bg-white border border-gray-200'}">
                    <p class="text-sm font-semibold mb-2">Evidence Memo</p>
                    <p class="text-sm whitespace-pre-wrap">{bundle.evidenceMemo}</p>
                </div>
                <div class="rounded-xl p-4 {$profile.lowBandwidthMode ? 'border border-white' : 'bg-white border border-gray-200'}">
                    <p class="text-sm font-semibold mb-2">Checklist</p>
                    <ul class="list-disc pl-5 space-y-1 text-sm">
                        {#each bundle.checklist as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </div>
            </div>
        </div>
    {/if}
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
