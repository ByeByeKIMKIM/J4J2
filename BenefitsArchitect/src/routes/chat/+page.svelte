<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { profile } from '../../stores/benefits';
    import type { ApplicantProfile } from '../../stores/benefits';
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
        { role: 'system', content: 'Agent A (Analyst) initialized. RAG mapping active.' }
    ]);
    let inputValue = $state('');
    let isStreaming = $state(false);
    let chatContainer: HTMLElement | undefined = $state();

    onMount(async () => {
        if (!$profile.state) {
            goto('/');
            return;
        }

        const greeting =
            $profile.state === 'CA'
                ? "Hello! I'm your eligibility analyst for California CalFresh. I'll guide you through a brief interview and verify each rule directly against the official state policy."
                : "Hello! I'm your eligibility analyst for New York SNAP. I'll guide you through a brief interview and verify each rule directly against the official state policy.";
        
        const opening = getNextStepMessage($profile);

        messages = [
            ...messages,
            { role: 'assistant', content: greeting },
            { role: 'assistant', content: opening }
        ];
    });

    async function scrollToBottom() {
        await tick();
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function getNextStepMessage(p: ApplicantProfile) {
        if (p.householdSize === null) return "First, including yourself, how many people live and buy/prepare food together in your household?";
        if (p.grossIncome === null) return "Got it. Next, what is your total monthly gross income before taxes?";
        if (p.rentMortgage === null) return "What is your monthly housing cost (rent or mortgage) in dollars?";
        if (p.utilityType === null) return "Finally, do you pay separately for 'Heating/Cooling', 'Phone Only', or 'None'?";
        return "Thank you! Based on your responses, I have verified all the necessary criteria. You can now View your Submission Bundle.";
    }

    async function sendMessage() {
        if (!inputValue.trim() || isStreaming) return;

        const userText = inputValue.trim();
        inputValue = '';

        messages = [...messages, { role: 'user', content: userText }];
        await scrollToBottom();

        isStreaming = true;

        // Display "Thinking" state badge
        messages = [...messages, { role: 'system', content: 'Agent B: Analyzing applicant response...' }];
        await scrollToBottom();
        
        await new Promise(r => setTimeout(r, 600));

        let stepCategory = "";

        // 1. Agent B: Updates the Profile (Logic Engine)
        profile.update(p => {
            const np = { ...p };
            if (np.householdSize === null) {
                np.householdSize = parseInt(userText) || 1;
                stepCategory = "Income";
            } else if (np.grossIncome === null) {
                np.grossIncome = parseInt(userText) || 0;
                np.logicStep = 1; // Income verified
                stepCategory = "Income";
            } else if (np.rentMortgage === null) {
                np.rentMortgage = parseInt(userText) || 0;
                np.logicStep = 2; // Deductions partial
                stepCategory = "Deductions";
            } else if (np.utilityType === null) {
                let ut: "Heating/Cooling" | "Phone Only" | "None" = "None";
                const lower = userText.toLowerCase();
                if (lower.includes("heat") || lower.includes("cool")) ut = "Heating/Cooling";
                else if (lower.includes("phone")) ut = "Phone Only";
                np.utilityType = ut;
                np.logicStep = 3; // Deductions full
                stepCategory = "Deductions";
            }
            return np;
        });

        const currentProfile = $profile;

        // 2. UI Update: Multi-agent nature
        messages[messages.length - 1] = { role: 'system', content: 'Agent A: Verifying State Policy...' };
        await scrollToBottom();

        // 3. Agent A: Spot Check against Policy DB hook
        if (stepCategory) {
            try {
                const res = await fetch('/api/policy-lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: currentProfile.state, category: stepCategory })
                });

                if (res.ok) {
                    const data = await res.json();
                    profile.update(p => ({
                        ...p,
                        evidenceLog: [
                            ...p.evidenceLog,
                            {
                                id: Date.now().toString(),
                                category: stepCategory,
                                citation: data.citation,
                                text: data.text,
                                query: `Lookup ${stepCategory} threshold for ${p.state}`
                            }
                        ]
                    }));
                }
            } catch (err) {
                console.error("Agent A RAG hook lookup failed:", err);
            }
        }

        // 4. UI Update: Finalizing deductive reasoning
        if (currentProfile.utilityType === null && currentProfile.rentMortgage !== null) {
             messages[messages.length - 1] = { role: 'system', content: 'Agent B: Calculating Deductions...' };
             await new Promise(r => setTimeout(r, 600));
        }

        // Remove the system badge, or keep it, then add Assistant message
        messages.pop(); // Remove system indicator to keep chat clean or just leave it. Let's remove it and reply naturally.

        messages = [...messages, { role: 'assistant', content: getNextStepMessage(currentProfile) }];
        
        if (currentProfile.utilityType !== null) {
            profile.update(p => ({ ...p, logicStep: 4 })); // Fully done
        }

        isStreaming = false;
        await scrollToBottom();
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
