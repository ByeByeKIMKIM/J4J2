export interface PolicyState {
    name: string;
    program: string;
    incomeLimitHousehold1: number;
    utilityAllowance: number;
    manualReference: string;
    evidenceSnippets: {
        location: string;
        income: string;
        deductions: string;
        eligibility: string;
    };
}

export const policyMap: Record<string, PolicyState> = {
    CA: {
        name: 'California',
        program: 'CalFresh',
        incomeLimitHousehold1: 2430,
        utilityAllowance: 485,
        manualReference: 'MPP Section 63-503',
        evidenceSnippets: {
            location: 'Per MPP Section 63-503, California residency verified.',
            income: 'Income falls below the CalFresh gross limit for the reported household size.',
            deductions: 'Housing and utility costs qualify for the Standard Utility Allowance (SUA).',
            eligibility: 'Applicant meets the preliminary requirements for CalFresh expedited service.'
        }
    },
    NY: {
        name: 'New York',
        program: 'SNAP',
        incomeLimitHousehold1: 2430,
        utilityAllowance: 878,
        manualReference: 'SNAP Source Book Section 5',
        evidenceSnippets: {
            location: 'Per SNAP Source Book Section 5, New York residency verified.',
            income: 'Income falls below the NY SNAP gross limit for the reported household size.',
            deductions: 'Heating bills qualify for the New York Standard Utility Allowance (SUA).',
            eligibility: 'Applicant meets the preliminary requirements for NY SNAP.'
        }
    }
};
