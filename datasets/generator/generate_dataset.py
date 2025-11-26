#!/usr/bin/env python3
"""
Dataset Generator for LangPatrol SDK Testing

This script uses Ollama to generate realistic prompts with issues and related
message history for testing the LangPatrol SDK performance.

Usage:
    python generate_dataset.py --dataset my_dataset --count 10
    python generate_dataset.py --dataset my_dataset --count 50 --tokens 5000

Options:
    --count <n>        Number of test cases to generate (default: 10)
    --dataset <name>   Dataset folder name (default: generated_dataset)
    --tokens <n>        Target tokens per prompt (default: 2000)
    --model <name>      Ollama model name (overrides .env, default: llama3.2)
"""

import os
import sys
import json
import argparse
import requests
from typing import List, Dict, Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Issue types that LangPatrol detects
ISSUE_TYPES = [
    "MISSING_PLACEHOLDER",
    "MISSING_REFERENCE", 
    "CONFLICTING_INSTRUCTION",
    "SCHEMA_RISK",
    "TOKEN_OVERAGE"
]

# System prompt for generating prompts with issues
SYSTEM_PROMPT = """You are a prompt engineering expert. Generate realistic prompts that contain specific issues for testing an AI prompt analyzer.

Generate prompts that intentionally include these issues:
1. MISSING_PLACEHOLDER: Use template variables like {{variable}}, {{#if var}}, or {{customer_name}} that are not defined
2. MISSING_REFERENCE: Use phrases like "as discussed earlier", "the report above", "previous results", "the steps below" without context
3. CONFLICTING_INSTRUCTION: Include contradictory directives like "be concise" vs "detailed explanation", or "JSON only" vs "include explanations"
4. SCHEMA_RISK: Request JSON output but also ask for narrative/explanations alongside it
5. TOKEN_OVERAGE: Mention token limits but create prompts that would exceed them

Make the prompts realistic and varied - they should look like real user prompts for AI assistants, customer support systems, or data processing tasks.

Generate ONE prompt per response. The prompt should be substantial (aim for the target token count) and include multiple issues naturally."""

# System prompt for generating message history
MESSAGE_HISTORY_PROMPT = """Based on the following prompt, generate a realistic conversation history (3-5 messages) that would lead to this prompt being used.

The conversation should include:
- System messages setting context
- User messages asking questions or providing information
- Assistant messages responding

Make it realistic and related to the prompt. The conversation should make sense as a context for the final prompt.

Return ONLY a JSON array of messages in this format:
[
  {"role": "system", "content": "..."},
  {"role": "user", "content": "..."},
  {"role": "assistant", "content": "..."}
]

No explanations, just the JSON array."""


class OllamaClient:
    """Client for interacting with Ollama API"""
    
    def __init__(self, base_url: Optional[str] = None, model: Optional[str] = None):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.2")
        
        # Remove trailing slash
        self.base_url = self.base_url.rstrip('/')
        
    def generate(self, prompt: str, system: Optional[str] = None, temperature: float = 0.7) -> str:
        """Generate text using Ollama"""
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
            }
        }
        
        if system:
            payload["system"] = system
            
        try:
            response = requests.post(url, json=payload, timeout=300)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "").strip()
        except requests.exceptions.RequestException as e:
            print(f"Error calling Ollama API: {e}")
            raise
    
    def generate_prompt_with_issues(self, target_tokens: int = 2000) -> str:
        """Generate a prompt that contains issues"""
        user_prompt = f"""Generate a realistic prompt that contains multiple issues from the list above.

Target length: approximately {target_tokens} tokens (roughly {target_tokens * 4} characters).

The prompt should:
- Be realistic and useful (not obviously synthetic)
- Include 2-4 different types of issues naturally
- Be substantial enough for performance testing
- Include realistic content like customer support requests, data processing tasks, or AI assistant prompts

Generate the prompt now:"""
        
        return self.generate(user_prompt, system=SYSTEM_PROMPT, temperature=0.8)
    
    def generate_message_history(self, prompt: str) -> List[Dict[str, str]]:
        """Generate related message history for a prompt"""
        user_prompt = f"{MESSAGE_HISTORY_PROMPT}\n\nPrompt:\n{prompt}\n\nGenerate the conversation history:"
        
        response = self.generate(user_prompt, temperature=0.7)
        
        # Try to extract JSON from response
        try:
            # Find JSON array in response
            start = response.find('[')
            end = response.rfind(']') + 1
            if start >= 0 and end > start:
                json_str = response[start:end]
                messages = json.loads(json_str)
                
                # Validate message format
                valid_messages = []
                for msg in messages:
                    if isinstance(msg, dict) and "role" in msg and "content" in msg:
                        if msg["role"] in ["system", "user", "assistant"]:
                            valid_messages.append({
                                "role": msg["role"],
                                "content": str(msg["content"])
                            })
                
                return valid_messages if valid_messages else self._default_messages()
            else:
                return self._default_messages()
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Warning: Could not parse message history JSON: {e}")
            print(f"Response was: {response[:200]}...")
            return self._default_messages()
    
    def _default_messages(self) -> List[Dict[str, str]]:
        """Generate default message history if parsing fails"""
        return [
            {
                "role": "system",
                "content": "You are a helpful AI assistant."
            },
            {
                "role": "user",
                "content": "I need help with a task."
            }
        ]


def estimate_tokens(text: str) -> int:
    """Rough token estimation (OpenAI-style: ~4 chars per token)"""
    return len(text) // 4


def generate_test_case(
    client: OllamaClient,
    case_id: int,
    target_tokens: int,
    include_messages: bool = True
) -> Dict:
    """Generate a single test case"""
    print(f"Generating test case {case_id}...", end=" ", flush=True)
    
    # Generate prompt with issues
    prompt = client.generate_prompt_with_issues(target_tokens)
    
    # Generate message history
    messages = None
    if include_messages:
        try:
            messages = client.generate_message_history(prompt)
        except Exception as e:
            print(f"Warning: Failed to generate messages: {e}")
            messages = None
    
    # Estimate which issues might be present (we can't know for sure without analyzing)
    # We'll leave expected_issue_codes empty and let the benchmark tool detect them
    expected_issues = []  # Could be enhanced to use LangPatrol to detect issues
    
    print(f"✓ ({estimate_tokens(prompt)} tokens)")
    
    return {
        "id": f"ollama-gen-{case_id:04d}",
        "category": "ollama-generated",
        "prompt": prompt,
        "messages": messages,
        "schema": None,
        "expectedIssueCodes": expected_issues,
        "notes": f"Generated with Ollama model {client.model}, target tokens: {target_tokens}"
    }


def load_existing_dataset(dataset_dir: Path) -> List[Dict]:
    """Load existing test cases from dataset directory"""
    test_cases = []
    index_path = dataset_dir / "index.json"
    
    if index_path.exists():
        try:
            with open(index_path, 'r', encoding='utf-8') as f:
                index_data = json.load(f)
                test_case_ids = index_data.get("testCases", [])
                
                for test_id in test_case_ids:
                    test_case_path = dataset_dir / f"{test_id}.json"
                    if test_case_path.exists():
                        try:
                            with open(test_case_path, 'r', encoding='utf-8') as tc_file:
                                test_case = json.load(tc_file)
                                test_cases.append(test_case)
                        except (json.JSONDecodeError, IOError) as e:
                            print(f"Warning: Could not load {test_case_path}: {e}")
                            
                if test_cases:
                    print(f"📂 Loaded {len(test_cases)} existing test cases from {dataset_dir}")
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not load index.json: {e}")
    
    return test_cases


def save_test_case(test_case: Dict, dataset_dir: Path):
    """Save a single test case to JSON file and update index"""
    # Ensure directory exists
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    # Save individual test case file
    test_case_path = dataset_dir / f"{test_case['id']}.json"
    with open(test_case_path, 'w', encoding='utf-8') as f:
        json.dump(test_case, f, indent=2, ensure_ascii=False)
    
    # Load existing index
    index_path = dataset_dir / "index.json"
    if index_path.exists():
        try:
            with open(index_path, 'r', encoding='utf-8') as f:
                index_data = json.load(f)
        except (json.JSONDecodeError, IOError):
            index_data = {"testCases": [], "metadata": {}}
    else:
        index_data = {"testCases": [], "metadata": {}}
    
    # Update index
    if test_case['id'] not in index_data["testCases"]:
        index_data["testCases"].append(test_case['id'])
    
    # Update metadata
    index_data["metadata"] = {
        "totalTestCases": len(index_data["testCases"]),
        "lastUpdated": test_case.get("notes", ""),
        "format": "json"
    }
    
    # Save updated index
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(
        description="Generate test dataset using Ollama",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="Number of test cases to generate (default: 10)"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default="generated_dataset",
        help="Dataset folder name (default: generated_dataset)"
    )
    parser.add_argument(
        "--tokens",
        type=int,
        default=2000,
        help="Target tokens per prompt (default: 2000)"
    )
    parser.add_argument(
        "--model",
        type=str,
        help="Ollama model name (overrides .env, default: llama3.2)"
    )
    parser.add_argument(
        "--base-url",
        type=str,
        help="Ollama base URL (overrides .env, default: http://localhost:11434)"
    )
    parser.add_argument(
        "--no-messages",
        action="store_true",
        help="Skip generating message history"
    )
    
    args = parser.parse_args()
    
    # Initialize Ollama client
    client = OllamaClient(
        base_url=args.base_url,
        model=args.model
    )
    
    # Setup dataset directory
    dataset_dir = Path("datasets") / args.dataset
    
    print(f"🚀 Starting dataset generation")
    print(f"   Model: {client.model}")
    print(f"   Base URL: {client.base_url}")
    print(f"   Count: {args.count}")
    print(f"   Target tokens per prompt: {args.tokens}")
    print(f"   Dataset folder: {dataset_dir}")
    print()
    
    # Load existing test cases
    existing_cases = load_existing_dataset(dataset_dir)
    existing_ids = {tc["id"] for tc in existing_cases}
    
    # Test connection
    try:
        print("Testing Ollama connection...", end=" ", flush=True)
        test_response = requests.get(f"{client.base_url}/api/tags", timeout=5)
        test_response.raise_for_status()
        print("✓")
    except requests.exceptions.RequestException as e:
        print(f"✗")
        print(f"❌ Error: Could not connect to Ollama at {client.base_url}")
        print(f"   Make sure Ollama is running and accessible")
        print(f"   Error: {e}")
        sys.exit(1)
    
    # Generate test cases
    new_test_cases = []
    start_id = len(existing_cases) + 1
    
    try:
        for i in range(start_id, start_id + args.count):
            try:
                test_case = generate_test_case(
                    client,
                    i,
                    args.tokens,
                    include_messages=not args.no_messages
                )
                
                # Skip if already exists
                if test_case["id"] in existing_ids:
                    print(f"   Skipping {test_case['id']} (already exists)")
                    continue
                
                # Save immediately (incremental save)
                save_test_case(test_case, dataset_dir)
                new_test_cases.append(test_case)
                existing_ids.add(test_case["id"])
                
            except KeyboardInterrupt:
                print("\n\n⚠️  Interrupted by user")
                print(f"💾 Saved {len(new_test_cases)} new test cases before interruption")
                break
            except Exception as e:
                print(f"✗ Error: {e}")
                continue
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        print(f"💾 Saved {len(new_test_cases)} new test cases before interruption")
    
    # Load all test cases for summary
    all_test_cases = load_existing_dataset(dataset_dir)
    
    if all_test_cases:
        # Print summary
        total_tokens = sum(estimate_tokens(tc["prompt"]) for tc in all_test_cases)
        avg_tokens = total_tokens // len(all_test_cases) if all_test_cases else 0
        
        print(f"\n📊 Summary:")
        print(f"   Total test cases: {len(all_test_cases)}")
        print(f"   New test cases: {len(new_test_cases)}")
        print(f"   Total tokens: ~{total_tokens}")
        print(f"   Average tokens per prompt: ~{avg_tokens}")
        print(f"   Dataset location: {dataset_dir}")
        print(f"\n💡 Next steps:")
        print(f"   Dataset saved incrementally - safe to interrupt and resume")
        print(f"   To use with benchmark tool, convert JSON to CSV or update benchmark tool")
    else:
        print("\n❌ No test cases were generated")


if __name__ == "__main__":
    main()

