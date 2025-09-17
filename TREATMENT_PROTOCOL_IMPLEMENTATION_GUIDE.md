# Treatment Protocol Implementation Guide

## Overview
This guide explains how to implement new illness type treatment protocols in the TreatmentModal.tsx system. The system dynamically selects appropriate treatment sequences and main treatments ("uygulama") based on patient-specific criteria.

## Current Implementation
Currently implemented: **Dermatolojik Sistem** (Dermatological System) in `src/pages/panel/components/TreatmentModal.tsx`

## System Architecture

### 1. Treatment Protocol Structure
Each illness type follows this structure in the `TREATMENT_PROTOCOLS` object:

```typescript
'ILLNESS_SYSTEM_NAME': {
  'MAIN_TREATMENT_NAME': {
    name: 'Treatment Name',
    description: 'Treatment description (uygulama text)',
    ageGroups: {
      '2-7': { /* age-specific dosages */ },
      '8-14': { /* age-specific dosages */ },
      'adult': { /* age-specific dosages */ }
    },
    supportingTreatments: ['SUPPORTING_TREATMENT_1', 'SUPPORTING_TREATMENT_2'],
    conditions: ['CONDITION_1', 'CONDITION_2'],
    symptomRequirements: { /* symptom thresholds */ },
    toxicityRequirement: boolean,
    priority: number,
    contraindications: [],
    control: 'Control frequency'
  }
}
```

### 2. Age Group Dosage Structure
Each age group contains:
- `sessions`: Main treatment frequency (e.g., '2X1 T', '3X2 T')
- `frequency`: Treatment frequency (usually 'Regülin')
- `treatmentSequence`: Array of treatment phases

### 3. Treatment Sequence Phases

**IMPORTANT**: Treatment phases vary completely between illness types. The example below is specific to Dermatolojik Sistem only.

#### Example: Dermatolojik Sistem Phases
- **Remember**: ARD-REM (always present for this system)
- **1 Regeneration**: DVD-REG (always present for this system)
- **2 Regeneration**: ISY-REG (always present for this system)
- **3 Regeneration**: DTX-19 (conditional - high toxicity)
- **4 Regeneration**: SDS-X (conditional - high stress ≥7/10)
- **Main Treatment**: Final treatment (HACAMAT, MINOR OZON, etc.)

#### Other Illness Systems May Have:
- Completely different treatment medications/protocols
- Different number of regeneration phases
- Different conditional logic and triggers
- Unique "Remember" or initial phases
- Multiple main treatments running in parallel
- No regeneration phases at all
- Custom phase naming conventions

**Agent Instructions**: Always extract the exact phases from the provided table image. Do not assume the structure follows the Dermatolojik Sistem pattern.

### 4. Patient Criteria System
The system evaluates:
- **Age**: Determines dosage levels
- **Toxicity Assessment**: `anamrezData.toxicityAssessment.hasToxicity`
- **Stress Level**: `anamrezData.symptomRatings.stres` (0-10 scale)
- **Diagnosis Systems**: `anamrezData.selectedDiagnosisSystems`
- **Custom Symptom Ratings**: Various symptoms with 0-10 ratings

## Implementation Tasks for New Illness Types

### Task 1: Analyze Treatment Table Image
When provided with a treatment table image:
1. Identify the illness system name
2. Extract all possible main treatments ("uygulama")
3. Note age-specific dosages for each treatment phase
4. Identify conditional treatments (based on toxicity, stress, or other symptoms)
5. Extract treatment descriptions and control frequencies

### Task 2: Define Treatment Selection Logic
For each main treatment, determine:
- **Conditions**: Which diagnosis systems trigger this treatment
- **Symptom Requirements**: Minimum symptom ratings required
- **Toxicity Requirements**: Whether high toxicity is required/considered
- **Priority**: Higher priority treatments are selected when multiple options match
- **Supporting Treatments**: Additional treatments used in the sequence

### Task 3: Implement in TREATMENT_PROTOCOLS
Add the new illness system to the `TREATMENT_PROTOCOLS` object following the existing structure.

### Task 4: Update Dynamic Logic (if needed)
The `buildTreatmentSequence()` function may need updates for:
- New conditional treatments beyond DTX-19 and SDS-X
- Different symptom thresholds
- Illness-specific treatment selection logic

### Task 5: Update Treatment Selection Logic
Modify `getBestTreatment()` function if new selection criteria are needed:
- Additional condition matching logic
- New symptom requirement patterns
- Different priority systems

## Key Functions to Understand

### `getPatientAgeGroup(birthDate: string)`
- Categorizes patients into age groups: '2-7', '8-14', 'adult'

### `meetsTreatmentRequirements(treatment: any)`
- Validates if patient meets treatment criteria
- Checks toxicity and symptom requirements

### `buildTreatmentSequence(treatment: any, ageGroup: string)`
- Creates dynamic treatment sequence based on patient conditions
- Handles conditional treatments (DTX-19 for toxicity, SDS-X for stress)

### `getBestTreatment()`
- Selects the best treatment protocol for the patient
- Sorts by priority when multiple treatments are applicable

## Example: Dermatolojik Sistem Implementation
Reference the existing implementation (lines 6-104) for:
- HACAMAT protocol (standard treatment)
- MINOR OZON protocol (high toxicity/stress treatment)
- Age-specific dosing patterns
- Conditional treatment logic

## Data Flow
1. Patient data + anamnez data → Age group determination
2. Diagnosis systems + symptom ratings → Treatment requirement validation
3. Best matching treatment → Dynamic sequence building
4. Final protocol → UI display with complete treatment timeline

## Testing Considerations
When implementing new protocols:
- Test all age groups (2-7, 8-14, adult)
- Test with different toxicity levels
- Test with various symptom rating combinations
- Verify conditional treatments are added correctly
- Ensure priority system works when multiple treatments match

## UI Integration
The treatment display automatically handles:
- Treatment sequence visualization
- Patient criteria summary
- Treatment selection criteria display
- Dynamic descriptions based on selected treatment

## Notes for AI Agents
- Always maintain the existing code structure and patterns
- Follow the conditional logic patterns established in Dermatolojik Sistem
- Ensure all new treatments have complete age group definitions
- Test treatment selection logic thoroughly
- Maintain consistency in naming conventions and data structures
- Pay attention to Turkish medical terminology and descriptions