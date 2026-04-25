import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type StateSelection = 'CA' | 'NY' | null;

export interface EvidenceItem {
    id: string;
    category: string;
    citation: string;
    text: string;
    step?: string;
    source?: string;
    query?: string;
    rank?: number;
    score?: number;
}

export interface ApplicantProfile {
    state: StateSelection;
    householdSize: number | null;
    grossIncome: number | null;
    hasElderlyOrDisabled: boolean | null;
    rentMortgage: number | null;
    utilityType: "Heating/Cooling" | "Phone Only" | "None" | null;
    evidenceLog: EvidenceItem[];
    logicStep: number;
    interviewComplete: boolean;
    finalDetermination: string | null;
    evidenceMemo: string | null;
    requiredDocuments: string[];
    prefilledApplication: string | null;
    lowBandwidthMode: boolean;
}

const defaultState: ApplicantProfile = {
    state: null,
    householdSize: null,
    grossIncome: null,
    hasElderlyOrDisabled: null,
    rentMortgage: null,
    utilityType: null,
    evidenceLog: [],
    logicStep: 0,
    interviewComplete: false,
    finalDetermination: null,
    evidenceMemo: null,
    requiredDocuments: [],
    prefilledApplication: null,
    lowBandwidthMode: false,
};

function createProfileStore() {
    let initial = defaultState;
    if (browser) {
        const stored = sessionStorage.getItem('benefits_profile');
        if (stored) {
            try {
                initial = JSON.parse(stored);
            } catch (e) {}
        }
    }

    const { subscribe, set, update } = writable<ApplicantProfile>(initial);

    if (browser) {
        subscribe(val => {
            sessionStorage.setItem('benefits_profile', JSON.stringify(val));
        });
    }

    return {
        subscribe,
        set,
        update,
        reset: () => set(defaultState),
        nukeSession: () => {
            set(defaultState);
            if (browser) {
                sessionStorage.removeItem('benefits_profile');
                sessionStorage.clear();
            }
        }
    };
}

export const profile = createProfileStore();
export const nukeSession = profile.nukeSession;
