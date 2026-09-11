import httpx
import json
import time

def send_monitored_prompt(api_key: str, prompt: str, model: str = "llama3-8b-8192"):
    """
    Sends a completion request to Groq and extracts all rate-limit headers 
    and performance runtime metrics.
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}]
    }

    print(f"Sending request using model: {model}...\n")
    
    start_time = time.time()
    try:
        with httpx.Client() as client:
            response = client.post(url, headers=headers, json=data, timeout=30.0)
            
        # 1. Total network trip time (client perspective)
        client_elapsed_time = time.time() - start_time
        
        # Check for errors (e.g., HTTP 429 Rate Limit)
        if response.status_code == 429:
            print("❌ Error: Rate limit exceeded (HTTP 429)!")
            print(f"Tokens Reset Time: {response.headers.get('x-ratelimit-reset-tokens')}")
            print(f"Requests Reset Time: {response.headers.get('x-ratelimit-reset-requests')}")
            return
            
        response.raise_for_status()
        res_json = response.json()
        
        # --- PARSE METRICS ---
        
        # Rate Limit Tracker (from Headers)
        rate_limits = {
            "Remaining Requests (Day)": response.headers.get("x-ratelimit-remaining-requests"),
            "Remaining Tokens (Min)": response.headers.get("x-ratelimit-remaining-tokens"),
            "Time Until Token Reset": response.headers.get("x-ratelimit-reset-tokens"),
            "Time Until Request Reset": response.headers.get("x-ratelimit-reset-requests"),
        }
        
        # Runtime & Token Metrics (from JSON Body)
        usage = res_json.get("usage", {})
        
        # Calculate Tokens Per Second (Generation Speed)
        comp_tokens = usage.get("completion_tokens", 0)
        comp_time = usage.get("completion_time", 0.0001)  # avoid division by zero
        tokens_per_sec = comp_tokens / comp_time if comp_tokens else 0
        
        # Print Results cleanly
        print("=== 📋 RESPONSE TEXT ===")
        print(res_json["choices"][0]["message"]["content"].strip())
        print("========================\n")
        
        print("⏱️ --- RUNTIME METRICS (GROQ SERVER-SIDE) ---")
        print(f"Queue Wait Time:       {usage.get('queue_time', 0):.4f}s")
        print(f"Prompt Process Time:  {usage.get('prompt_time', 0):.4f}s")
        print(f"Response Gen Time:    {usage.get('completion_time', 0):.4f}s")
        print(f"Total Server Time:    {usage.get('total_time', 0):.4f}s")
        print(f"Client Round-Trip:     {client_elapsed_time:.4f}s")
        print(f"Generation Speed:      {tokens_per_sec:.2f} tokens/sec\n")
        
        print("📊 --- TOKEN USAGE ---")
        print(f"Prompt Tokens:        {usage.get('prompt_tokens')}")
        print(f"Completion Tokens:    {usage.get('completion_tokens')}")
        print(f"Total Tokens Used:    {usage.get('total_tokens')}\n")
        
        print("🛑 --- RATE LIMIT STATUS (REMAINING) ---")
        for key, value in rate_limits.items():
            print(f"{key:<25}: {value}")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Replace with your actual Groq API Key or load from env variables
    API_KEY = "gsk_xxxxYOUR_ACTUAL_KEY_HERExxxx"
    
    if "YOUR_ACTUAL_KEY" in API_KEY:
        print("⚠️  Please update the API_KEY variable with your valid Groq API key before running.")
    else:
        sample_prompt = "Explain quantum computing in one short paragraph."
        send_monitored_prompt(API_KEY, sample_prompt)
