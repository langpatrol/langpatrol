#!/usr/bin/env python3
"""
Generate 300 test cases for missing reference detection using Ollama + Llama 3.1
Creates directory structure: sector/test_number/{prompt.txt, history.json, expected_output.json, prompt_annotated.txt}

Usage:
    python generate_missing_reference_dataset.py --outdir ../missing_reference_dataset/
    
Requirements:
    pip install ollama requests
"""

import json
import argparse
import random
import os
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
import requests

# ==================== Configuration ====================

OLLAMA_BASE_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.2:latest"
MIN_PROMPT_LENGTH = 2000  # Minimum characters for prompt

SECTORS = [
    "Customer Support",
    "Pharma/Tech",
    "Booking Agent",
    "E-commerce",
    "Healthcare",
    "Legal",
    "Education",
    "Finance"
]

PATTERN_TYPES = [
    "missing_definite",      # "the report" without antecedent
    "missing_deictic",       # "as discussed earlier" without context
    "missing_forward",       # "the following report" that doesn't exist
    "resolved",              # Reference with clear antecedent (should NOT flag)
    "mixed"                  # Multiple references, some resolved, some missing
]

# ==================== Ollama Integration ====================

def call_ollama(prompt: str, system: Optional[str] = None) -> str:
    """Call Ollama API with Llama 3.1"""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "top_p": 0.9,
        }
    }
    
    if system:
        payload["system"] = system
    
    try:
        response = requests.post(OLLAMA_BASE_URL, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "").strip()
    except requests.exceptions.RequestException as e:
        print(f"Error calling Ollama: {e}")
        return ""

# ==================== Reference Detection Patterns ====================

# Patterns to detect in the prompt for annotation
REFERENCE_PATTERNS = [
    (r'\b(the|this|that|these|those)\s+([a-z][a-z0-9_-]{2,})\b', 'definite_noun'),
    (r'\bas\s+(discussed|mentioned|stated|noted)\s+(earlier|above|previously|before)\b', 'deictic'),
    (r'\b(the|this|that)\s+(previous|earlier|prior|aforementioned|above|below)\s+([a-z][a-z0-9_-]{2,})\b', 'deictic_noun'),
    (r'\bcontinue\s+the\s+([a-z][a-z0-9_-]{2,})\b', 'continue_reference'),
    (r'\bthe\s+([a-z][a-z0-9_-]{2,})\s+(above|below|mentioned|discussed|we\s+discussed)\b', 'positional_reference'),
    (r'\bthe\s+following\s+([a-z][a-z0-9_-]{2,})\b', 'forward_reference'),
    (r'\bas\s+shown\s+below\b', 'forward_reference'),
    (r'\bthe\s+([a-z][a-z0-9_-]{2,})\s+below\b', 'forward_reference'),
    (r'\bthese\s+([a-z][a-z0-9_-]{2,})\b', 'plural_reference'),
    (r'\bthose\s+([a-z][a-z0-9_-]{2,})\b', 'plural_reference'),
]

def annotate_prompt(prompt: str, missing_references: List[Dict[str, Any]]) -> str:
    """Annotate prompt with [MISSING_REFERENCE] tags"""
    annotated = prompt
    offset = 0
    
    # Sort by start position (descending) to avoid offset issues
    sorted_refs = sorted(missing_references, key=lambda x: x.get('start', 0), reverse=True)
    
    for ref in sorted_refs:
        start = ref.get('start', 0)
        end = ref.get('end', start + len(ref.get('text', '')))
        text = ref.get('text', '')
        
        if start >= 0 and end <= len(prompt):
            # Insert annotation after the reference
            annotated = annotated[:end + offset] + '[MISSING_REFERENCE]' + annotated[end + offset:]
            offset += len('[MISSING_REFERENCE]')
    
    return annotated

def detect_references_in_prompt(prompt: str) -> List[Dict[str, Any]]:
    """Detect potential references in the prompt"""
    references = []
    
    for pattern, ref_type in REFERENCE_PATTERNS:
        for match in re.finditer(pattern, prompt, re.IGNORECASE):
            references.append({
                'text': match.group(0),
                'start': match.start(),
                'end': match.end(),
                'type': ref_type
            })
    
    # Remove duplicates and sort by position
    seen = set()
    unique_refs = []
    for ref in sorted(references, key=lambda x: x['start']):
        key = (ref['start'], ref['end'])
        if key not in seen:
            seen.add(key)
            unique_refs.append(ref)
    
    return unique_refs

# ==================== Test Case Generation ====================

def generate_test_case_prompt(sector: str, pattern_type: str, case_num: int) -> str:
    """Generate a prompt for Llama to create a test case"""
    
    pattern_descriptions = {
        "missing_definite": "a prompt that references a noun with 'the/this/that' but the noun was never mentioned in the conversation history",
        "missing_deictic": "a prompt with vague references like 'as discussed earlier' or 'the previous report' but no clear antecedent exists",
        "missing_forward": "a prompt that references something 'below' or 'following' that doesn't actually exist in the message",
        "resolved": "a prompt that references a noun, but the noun WAS clearly mentioned in the conversation history (this should NOT be flagged)",
        "mixed": "a prompt with multiple references - some that are resolved (mentioned earlier) and some that are missing (not mentioned)"
    }
    
    return f"""Generate a realistic test case for a missing reference detection system in the {sector} sector.

Requirements:
1. Create a conversation history with 3-6 messages (alternating user and assistant)
2. The conversation should be about {sector.lower()} topics
3. The final user message (the "prompt" field) MUST be at least {MIN_PROMPT_LENGTH} characters long
4. The final user message should contain {pattern_descriptions[pattern_type]}
5. Make it natural and realistic - like a real conversation with detailed context, specific requests, and comprehensive instructions
6. For "resolved" type: ensure the referenced noun IS mentioned in the history
7. For "missing" types: ensure the referenced noun is NOT mentioned in the history
8. The prompt should include multiple sentences, detailed instructions, background context, and specific requirements to reach the minimum length

Output format (JSON only, no markdown):
{{
  "messages": [
    {{"role": "user", "content": "..."}},
    {{"role": "assistant", "content": "..."}},
    ...
  ],
  "prompt": "the final user message with the reference",
  "missing_references": [
    {{
      "text": "the report",
      "start": 10,
      "end": 20,
      "type": "definite_noun"
    }}
  ],
  "expected_issue_codes": ["MISSING_REFERENCE"] or [] if resolved,
  "notes": "brief explanation of what reference is missing/resolved"
}}

Important:
- For "resolved" type: expected_issue_codes should be []
- For "missing" types: expected_issue_codes should be ["MISSING_REFERENCE"]
- Include all missing references in the missing_references array with accurate start/end positions
- Be specific about which references are missing vs resolved
- CRITICAL: The "prompt" field must be at least {MIN_PROMPT_LENGTH} characters. Include detailed context, multiple requirements, examples, or background information to reach this length.

Generate the test case now:"""

def extend_prompt_if_needed(prompt: str, sector: str, pattern_type: str) -> str:
    """Extend prompt with additional context if it's too short"""
    if len(prompt) >= MIN_PROMPT_LENGTH:
        return prompt
    
    # Generate extension context
    extension_prompts = [
        f"Please provide additional details about the {sector.lower()} context, including specific requirements, constraints, and expected outcomes.",
        f"Expand on the background information, include relevant examples, and provide comprehensive instructions for this {sector.lower()} scenario.",
        f"Add more context about the situation, include specific details about the process, and elaborate on the requirements for this {sector.lower()} use case."
    ]
    
    # Try to extend via LLM
    extend_prompt = f"""The following prompt is too short ({len(prompt)} characters). It needs to be at least {MIN_PROMPT_LENGTH} characters.

Current prompt:
"{prompt}"

Please extend this prompt naturally by adding:
- More detailed context about the {sector.lower()} scenario
- Specific requirements and constraints
- Background information
- Examples or use cases
- Additional instructions or clarifications

Keep the original meaning and missing reference intact. Output ONLY the extended prompt text (no JSON, no quotes, just the text)."""
    
    try:
        extended = call_ollama(extend_prompt)
        if extended and len(extended) > len(prompt):
            # Clean up the response (remove quotes, markdown, etc.)
            extended = extended.strip()
            if extended.startswith('"') and extended.endswith('"'):
                extended = extended[1:-1]
            if extended.startswith('```') and extended.endswith('```'):
                lines = extended.split('\n')
                extended = '\n'.join(lines[1:-1])
            return extended
    except Exception as e:
        print(f"  Warning: Could not extend prompt via LLM: {e}")
    
    # Fallback: append generic extension
    extension = f"""

Additional context: This request is part of a {sector.lower()} workflow that requires comprehensive analysis and detailed processing. Please ensure all relevant information is considered, including historical data, current state, and future requirements. The task involves multiple steps and may require coordination with other systems or stakeholders. Please provide a thorough response that addresses all aspects of this request, including any potential edge cases or special considerations that might apply to this specific {sector.lower()} scenario."""
    
    return prompt + extension

def generate_test_case_with_llm(sector: str, pattern_type: str, case_num: int) -> Optional[Dict[str, Any]]:
    """Generate a single test case using Llama 3.1"""
    
    system_prompt = f"""You are a test case generator for a missing reference detection system. 
Generate realistic, natural conversations that test whether the system can detect when references 
lack clear antecedents. Be creative but realistic. Always output valid JSON only. Include accurate 
character positions (start/end) for all missing references.

CRITICAL: The "prompt" field in your JSON output MUST be at least {MIN_PROMPT_LENGTH} characters long. 
Include detailed context, multiple requirements, examples, background information, or comprehensive 
instructions to ensure the prompt reaches this minimum length."""

    prompt = generate_test_case_prompt(sector, pattern_type, case_num)
    
    print(f"Generating {sector} - {pattern_type} - Case {case_num}...")
    response = call_ollama(prompt, system_prompt)
    
    if not response:
        return None
    
    # Try to extract JSON from response
    json_start = response.find('{')
    json_end = response.rfind('}') + 1
    
    if json_start == -1 or json_end == 0:
        print(f"  Warning: No JSON found in response")
        return None
    
    try:
        json_str = response[json_start:json_end]
        test_case = json.loads(json_str)
        
        # Validate structure
        if "messages" not in test_case or "prompt" not in test_case:
            print(f"  Warning: Invalid structure")
            return None
        
        # Ensure expected_issue_codes exists
        if "expected_issue_codes" not in test_case:
            test_case["expected_issue_codes"] = ["MISSING_REFERENCE"] if pattern_type != "resolved" else []
        
        # If missing_references not provided, detect them
        if "missing_references" not in test_case or not test_case["missing_references"]:
            if pattern_type != "resolved":
                detected = detect_references_in_prompt(test_case["prompt"])
                test_case["missing_references"] = detected
            else:
                test_case["missing_references"] = []
        
        # Validate and fix start/end positions
        prompt_text = test_case["prompt"]
        
        # Check and extend prompt if too short
        if len(prompt_text) < MIN_PROMPT_LENGTH:
            print(f"  Warning: Prompt too short ({len(prompt_text)} chars), extending to {MIN_PROMPT_LENGTH}...")
            extended_prompt = extend_prompt_if_needed(prompt_text, sector, pattern_type)
            
            # Update missing references positions if prompt was extended
            if len(extended_prompt) > len(prompt_text):
                # Re-detect references in extended prompt
                if pattern_type != "resolved":
                    test_case["missing_references"] = detect_references_in_prompt(extended_prompt)
            
            test_case["prompt"] = extended_prompt
            prompt_text = extended_prompt
            print(f"  Extended prompt to {len(extended_prompt)} characters")
        
        # Fix reference positions after potential extension
        for ref in test_case["missing_references"]:
            ref_text = ref.get("text", "")
            # Find actual position if not accurate
            if ref_text in prompt_text:
                actual_start = prompt_text.find(ref_text)
                if actual_start != -1:
                    ref["start"] = actual_start
                    ref["end"] = actual_start + len(ref_text)
        
        if "notes" not in test_case:
            test_case["notes"] = f"{pattern_type} pattern in {sector}"
        
        # Final validation
        if len(test_case["prompt"]) < MIN_PROMPT_LENGTH:
            print(f"  Error: Prompt still too short after extension ({len(test_case['prompt'])} chars)")
            # Add a final fallback extension
            test_case["prompt"] = extend_prompt_if_needed(test_case["prompt"], sector, pattern_type)
        
        return test_case
    except json.JSONDecodeError as e:
        print(f"  Warning: JSON decode error: {e}")
        return None

# ==================== File Writing ====================

def write_test_case_files(test_case: Dict[str, Any], sector: str, test_number: int, outdir: str):
    """Write all files for a single test case"""
    
    # Create directory structure
    sector_dir = os.path.join(outdir, sector.replace('/', '_'))
    test_dir = os.path.join(sector_dir, f"test_{test_number:04d}")
    os.makedirs(test_dir, exist_ok=True)
    
    # Write prompt.txt
    prompt_file = os.path.join(test_dir, "prompt.txt")
    with open(prompt_file, 'w', encoding='utf-8') as f:
        f.write(test_case["prompt"])
    
    # Write history.json
    history_file = os.path.join(test_dir, "history.json")
    with open(history_file, 'w', encoding='utf-8') as f:
        json.dump(test_case["messages"], f, indent=2, ensure_ascii=False)
    
    # Write expected_output.json
    expected_output = {
        "expected_issue_codes": test_case.get("expected_issue_codes", []),
        "missing_references": test_case.get("missing_references", []),
        "notes": test_case.get("notes", "")
    }
    expected_file = os.path.join(test_dir, "expected_output.json")
    with open(expected_file, 'w', encoding='utf-8') as f:
        json.dump(expected_output, f, indent=2, ensure_ascii=False)
    
    # Write prompt_annotated.txt
    annotated_prompt = annotate_prompt(
        test_case["prompt"],
        test_case.get("missing_references", [])
    )
    annotated_file = os.path.join(test_dir, "prompt_annotated.txt")
    with open(annotated_file, 'w', encoding='utf-8') as f:
        f.write(annotated_prompt)
    
    return test_dir

# ==================== Batch Generation ====================

def generate_dataset(total_cases: int = 300, outdir: str = ".") -> List[Dict[str, Any]]:
    """Generate the full dataset"""
    
    test_cases = []
    cases_per_sector = total_cases // len(SECTORS)
    remainder = total_cases % len(SECTORS)
    
    # Track test numbers per sector
    sector_test_numbers = {sector: 1 for sector in SECTORS}
    
    for sector_idx, sector in enumerate(SECTORS):
        sector_count = cases_per_sector + (1 if sector_idx < remainder else 0)
        cases_per_pattern = sector_count // len(PATTERN_TYPES)
        pattern_remainder = sector_count % len(PATTERN_TYPES)
        
        print(f"\n{'='*60}")
        print(f"Generating {sector_count} cases for {sector}")
        print(f"{'='*60}\n")
        
        for pattern_idx, pattern_type in enumerate(PATTERN_TYPES):
            pattern_count = cases_per_pattern + (1 if pattern_idx < pattern_remainder else 0)
            
            for case_num in range(pattern_count):
                test_case = generate_test_case_with_llm(sector, pattern_type, case_num + 1)
                
                if test_case:
                    test_number = sector_test_numbers[sector]
                    test_dir = write_test_case_files(test_case, sector, test_number, outdir)
                    test_cases.append({
                        **test_case,
                        "sector": sector,
                        "test_number": test_number,
                        "test_dir": test_dir
                    })
                    sector_test_numbers[sector] += 1
                    print(f"  ✓ Generated case {test_number} -> {test_dir}")
                else:
                    print(f"  ✗ Failed to generate case")
                    # Retry once
                    test_case = generate_test_case_with_llm(sector, pattern_type, case_num + 1)
                    if test_case:
                        test_number = sector_test_numbers[sector]
                        test_dir = write_test_case_files(test_case, sector, test_number, outdir)
                        test_cases.append({
                            **test_case,
                            "sector": sector,
                            "test_number": test_number,
                            "test_dir": test_dir
                        })
                        sector_test_numbers[sector] += 1
                        print(f"  ✓ Generated case {test_number} (retry) -> {test_dir}")
    
    return test_cases

def print_statistics(test_cases: List[Dict[str, Any]]):
    """Print generation statistics"""
    
    stats = {
        "total": len(test_cases),
        "by_category": {},
        "by_expected_code": {}
    }
    
    for tc in test_cases:
        category = tc.get("sector", "unknown")
        stats["by_category"][category] = stats["by_category"].get(category, 0) + 1
        
        codes = tc.get("expected_issue_codes", [])
        for code in codes:
            stats["by_expected_code"][code] = stats["by_expected_code"].get(code, 0) + 1
    
    print(f"\n{'='*60}")
    print(f"Generation Complete!")
    print(f"{'='*60}\n")
    print("Statistics:")
    print(json.dumps(stats, indent=2))
    print(f"\nTotal test cases: {len(test_cases)}")
    print(f"Output directory structure:")
    print(f"  sector_name/")
    print(f"    test_0001/")
    print(f"      prompt.txt")
    print(f"      history.json")
    print(f"      expected_output.json")
    print(f"      prompt_annotated.txt")

# ==================== Main ====================

def main():
    parser = argparse.ArgumentParser(description='Generate missing reference test dataset using Ollama')
    parser.add_argument('--outdir', type=str, default='.', help='Output directory')
    parser.add_argument('--cases', type=int, default=300, help='Number of test cases to generate')
    parser.add_argument('--check-ollama', action='store_true', help='Check if Ollama is available')
    
    args = parser.parse_args()
    
    # Check Ollama availability
    if args.check_ollama:
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                if MODEL in model_names:
                    print(f"✓ Ollama is running and {MODEL} is available")
                else:
                    print(f"✗ {MODEL} not found. Available models: {', '.join(model_names)}")
                    print(f"  Run: ollama pull {MODEL}")
                    return
            else:
                print("✗ Ollama API is not responding correctly")
                return
        except requests.exceptions.RequestException:
            print("✗ Cannot connect to Ollama. Is it running?")
            print("  Start with: ollama serve")
            return
    
    # Create output directory
    os.makedirs(args.outdir, exist_ok=True)
    
    # Generate dataset
    test_cases = generate_dataset(args.cases, args.outdir)
    
    # Print statistics
    print_statistics(test_cases)

if __name__ == "__main__":
    main()

