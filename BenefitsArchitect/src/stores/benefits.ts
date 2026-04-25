import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type StateSelection = 'CA' | 'NY' | null;

export interface UserProfile {
    state: StateSelection;
    householdSize: number | null;
    monthlyIncome: number | null;
    housingCosts: number | null;
    hasUtilityBills: boolean | null;
    logicStep: number;
    evidence: EvidenceItem[];
    lowBandwidthMode: boolean;
}

export interface EvidenceItem {
    id: string;
    step: string;
    text: string;
    source: string;
    query?: string;
    rank?: number;
    score?: number;
}

const defaultState: UserProfile = {
    state: null,
    householdSize: null,
    monthlyIncome: null,
    housingCosts: null,
    hasUtilityBills: null,
    logicStep: 0,
    evidence: [],
    lowBandwidthMode: false,
};

function createProfileStore() {
    // Initialize from sessionStorage if available
    let initial = defaultState;
    if (browser) {
        const stored = sessionStorage.getItem('benefits_profile');
        if (stored) {
            try {
                initial = JSON.parse(stored);
            } catch (e) {
                // ignore
            }
        }
    }

    const { subscribe, set, update } = writable<UserProfile>(initial);

    // Sync to sessionStorage
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
        selfDestruct: () => {
            set(defaultState);
            if (browser) {
                sessionStorage.removeItem('benefits_profile');
            }
        }
    };
}

export const profile = createProfileStore();
