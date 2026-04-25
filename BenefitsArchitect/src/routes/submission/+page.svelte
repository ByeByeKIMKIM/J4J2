<script lang="ts">
    import { profile } from '../../stores/benefits';
    import { goto } from '$app/navigation';
    import { Download, CheckCircle, ArrowLeft } from 'lucide-svelte';
    import { onMount } from 'svelte';

    onMount(() => {
        if (!$profile.state || $profile.logicStep < 4) {
            goto('/chat');
        }
    });

    function handlePrint() {
        window.print();
    }
</script>

<div class="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50 print:bg-white { $profile.lowBandwidthMode ? 'bg-black text-white' : '' }">
    <div class="max-w-4xl mx-auto space-y-6">
        
        <div class="flex items-center justify-between print:hidden mb-6">
            <button 
                on:click={() => goto('/chat')}
                class="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors { $profile.lowBandwidthMode ? 'border border-white hover:bg-white hover:text-black' : 'bg-white border border-gray-200 hover:bg-gray-50' }"
            >
                <ArrowLeft size={16} />
                Back to Chat
            </button>
            <button 
                on:click={handlePrint}
                class="flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-lg transition-colors { $profile.lowBandwidthMode ? 'border border-white bg-white text-black hover:bg-black hover:text-white' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' }"
            >
                <Download size={18} />
                Download Application (PDF)
            </button>
        </div>

        <!-- Printable Document -->
        <div class="p-8 md:p-12 border shadow-sm print:shadow-none print:border-none { $profile.lowBandwidthMode ? 'border-white bg-black' : 'bg-white border-gray-200 rounded-2xl' }">
            
            <div class="text-center border-b pb-8 mb-8 { $profile.lowBandwidthMode ? 'border-white' : 'border-gray-200' }">
                <h1 class="text-3xl font-extrabold mb-2 uppercase tracking-tight">Eligibility Memorandum</h1>
                <p class="text-lg { $profile.lowBandwidthMode ? 'text-gray-300' : 'text-gray-600' }">
                    Generated for { $profile.state === 'CA' ? 'CalFresh (California)' : 'SNAP (New York)' }
                </p>
            </div>

            <div class="grid md:grid-cols-2 gap-12 mb-12">
                <div>
                    <h3 class="text-lg font-bold mb-4 uppercase tracking-wider border-b pb-2 { $profile.lowBandwidthMode ? 'border-white' : 'border-gray-200' }">Applicant Details</h3>
                    <ul class="space-y-3">
                        <li class="flex justify-between">
                            <span class="{ $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">State</span>
                            <span class="font-medium">{$profile.state}</span>
                        </li>
                        <li class="flex justify-between">
                            <span class="{ $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">Household Size</span>
                            <span class="font-medium">{$profile.householdSize}</span>
                        </li>
                        <li class="flex justify-between">
                            <span class="{ $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">Monthly Gross Income</span>
                            <span class="font-medium">${$profile.monthlyIncome}</span>
                        </li>
                        <li class="flex justify-between">
                            <span class="{ $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">Housing Costs</span>
                            <span class="font-medium">${$profile.housingCosts}</span>
                        </li>
                        <li class="flex justify-between">
                            <span class="{ $profile.lowBandwidthMode ? 'text-gray-400' : 'text-gray-500' }">Separate Utility Bills</span>
                            <span class="font-medium">{$profile.hasUtilityBills ? 'Yes' : 'No'}</span>
                        </li>
                    </ul>
                </div>
                
                <div>
                    <h3 class="text-lg font-bold mb-4 uppercase tracking-wider border-b pb-2 { $profile.lowBandwidthMode ? 'border-white' : 'border-gray-200' }">System Assessment</h3>
                    <div class="p-4 rounded-xl flex items-start gap-3 { $profile.lowBandwidthMode ? 'border border-white' : 'bg-green-50 text-green-900 border border-green-200' }">
                        <CheckCircle class="mt-0.5 shrink-0 { $profile.lowBandwidthMode ? 'text-white' : 'text-green-600' }" />
                        <div>
                            <p class="font-bold mb-1">Preliminary Eligibility: Met</p>
                            <p class="text-sm opacity-90">Based on the provided data and standard deduction calculations, applicant appears to meet gross income limits for expedited processing.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <h3 class="text-lg font-bold mb-6 uppercase tracking-wider border-b pb-2 { $profile.lowBandwidthMode ? 'border-white' : 'border-gray-200' }">Verified Evidence & Legal Basis</h3>
                <div class="space-y-6">
                    {#each $profile.evidence as item}
                        <div class="flex gap-4">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 { $profile.lowBandwidthMode ? 'border border-white bg-black' : 'bg-blue-100 text-blue-600' }">
                                <span class="font-bold text-sm">✓</span>
                            </div>
                            <div>
                                <h4 class="font-bold text-lg mb-1">{item.step}</h4>
                                <p class="mb-2 italic { $profile.lowBandwidthMode ? 'text-gray-300' : 'text-gray-700' }">"{item.text}"</p>
                                <p class="text-sm font-medium { $profile.lowBandwidthMode ? 'text-gray-400' : 'text-blue-600' }">Authority: {item.source}</p>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

        </div>
    </div>
</div>
