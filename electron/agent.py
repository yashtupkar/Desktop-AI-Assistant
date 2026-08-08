import asyncio
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
from browser_use import Agent, BrowserSession, BrowserProfile
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# Load .env from project root (one level above this file)
load_dotenv(Path(__file__).parent.parent / ".env")

# Check if running in subprocess mode (TASK environment variable set)
SUBPROCESS_MODE = os.environ.get("TASK") is not None

# ============================================================
#  CONFIG — values loaded from .env
# ============================================================
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL     = os.environ.get("OPENROUTER_URL", "https://openrouter.ai/api/v1")
DEFAULT_MODEL      = os.environ.get("DEFAULT_MODEL", "google/gemini-2.5-flash-lite")
APP_REFERER        = os.environ.get("APP_REFERER", "http://localhost")
APP_TITLE          = os.environ.get("APP_TITLE", "Jarvis Desktop")
CHROME_USER_DATA_DIR = os.environ.get("CHROME_USER_DATA_DIR")
CHROME_PROFILE     = os.environ.get("CHROME_PROFILE", "Default")
# ============================================================

# --- Shared persistent browser session ---
_session: BrowserSession | None = None

async def get_session() -> BrowserSession:
    global _session
    if _session is None:
        print("[Browser] Launching browser session...")
        
        # Prepare browser arguments based on .env
        browser_kwargs = {
            "headless": False,
            "keep_alive": True  # Prevents browser from closing when agent finishes
        }
        if CHROME_USER_DATA_DIR:
            browser_kwargs["user_data_dir"] = CHROME_USER_DATA_DIR
            if CHROME_PROFILE:
                browser_kwargs["profile_directory"] = CHROME_PROFILE
                
        _session = BrowserSession(**browser_kwargs)
        await _session.start()
    return _session

async def close_browser():
    global _session
    if _session:
        await _session.stop()
        _session = None
        print("[Browser] Closed")

# Create LLM with proper configuration for browser-use
from browser_use.llm.openrouter.chat import ChatOpenRouter

# ============================================================
#  CORE — run any task in natural language
# ============================================================
async def run_task(task: str, model: str = DEFAULT_MODEL) -> str:
    print(f"\n[Jarvis] Task: {task.strip()[:80]}...")
    session = await get_session()
    
    llm = ChatOpenRouter(
        model=model,
        base_url=OPENROUTER_URL,
        api_key=OPENROUTER_API_KEY,
        temperature=0.7,
        http_referer=APP_REFERER,
    )
    
    agent = Agent(
        task=task,
        llm=llm,
        browser_session=session,
    )
    result = await agent.run()
    print(f"[Jarvis] Done!")
    return str(result)

# ============================================================
#  READY-MADE TASKS
# ============================================================

async def youtube_search_and_play(query: str) -> str:
    return await run_task(f"""
        1. Go to https://www.youtube.com
        2. Search for '{query}'
        3. Click the first regular video (not a Short)
        4. If an ad appears click Skip Ad as soon as it shows
        5. Let the video play
    """)

async def youtube_play_url(url: str) -> str:
    return await run_task(f"""
        1. Go to {url}
        2. If an ad appears click Skip Ad when available
        3. Let the video play
    """)

async def google_search(query: str) -> str:
    return await run_task(f"""
        1. Go to https://www.google.com
        2. Search for '{query}'
        3. Return a summary of the top 3 results
    """)

async def gmail_read_latest(count: int = 5) -> str:
    return await run_task(f"""
        1. Go to https://mail.google.com
        2. Read the latest {count} unread emails
        3. Return sender, subject and a brief summary of each
    """)

async def gmail_send(to: str, subject: str, body: str) -> str:
    return await run_task(f"""
        1. Go to https://mail.google.com
        2. Click Compose
        3. Set To: {to}
        4. Set Subject: {subject}
        5. Type this message: {body}
        6. Click Send
    """)

async def maps_search(location: str) -> str:
    return await run_task(f"""
        1. Go to https://www.google.com/maps
        2. Search for '{location}'
        3. Return the address, rating and opening hours if available
    """)

async def maps_directions(from_place: str, to_place: str, mode: str = "driving") -> str:
    return await run_task(f"""
        1. Go to https://www.google.com/maps
        2. Click Directions
        3. Set start as '{from_place}' and destination as '{to_place}'
        4. Select {mode} mode
        5. Return the route summary, distance and estimated time
    """)

async def amazon_search(product: str) -> str:
    return await run_task(f"""
        1. Go to https://www.amazon.in
        2. Search for '{product}'
        3. Return the top 3 results with name, price and rating
    """)

async def flipkart_search(product: str) -> str:
    return await run_task(f"""
        1. Go to https://www.flipkart.com
        2. Search for '{product}'
        3. Return the top 3 results with name, price and rating
    """)

async def get_latest_news(topic: str = "India") -> str:
    return await run_task(f"""
        1. Go to https://news.google.com
        2. Search for '{topic}'
        3. Return headlines and brief summary of top 5 news articles
    """)

async def get_weather(city: str) -> str:
    return await run_task(f"""
        1. Go to https://www.google.com
        2. Search for 'weather in {city}'
        3. Return current temperature, condition, humidity and forecast
    """)

async def whatsapp_send(contact: str, message: str) -> str:
    return await run_task(f"""
        1. Go to https://web.whatsapp.com
        2. Wait for QR code to be scanned if not logged in
        3. Search for contact '{contact}'
        4. Click on the contact
        5. Type and send this message: {message}
    """)

async def linkedin_search_jobs(role: str, location: str = "India") -> str:
    return await run_task(f"""
        1. Go to https://www.linkedin.com/jobs
        2. Search for '{role}' jobs in '{location}'
        3. Return top 5 job listings with company, title and location
    """)

async def fill_form(url: str, fields: dict) -> str:
    fields_str = "\n".join([f"   - Set '{k}' to '{v}'" for k, v in fields.items()])
    return await run_task(f"""
        1. Go to {url}
        2. Fill in these fields:
        {fields_str}
        3. Submit the form
        4. Return the confirmation or result
    """)

async def get_page_info(url: str) -> str:
    return await run_task(f"""
        1. Go to {url}
        2. Return a detailed summary of the main content,
           links, prices, or any important data on the page
    """)

async def scrape_data(url: str, what_to_extract: str) -> str:
    return await run_task(f"""
        1. Go to {url}
        2. Extract: {what_to_extract}
        3. Return the extracted data in a clean format
    """)

async def custom_task(instruction: str) -> str:
    """Run any custom browser task in plain English."""
    return await run_task(instruction)

# ============================================================
#  SUBPROCESS MODE — for Node.js bridge integration
# ============================================================
async def subprocess_main():
    """Main entry point when called from Node.js bridge"""
    try:
        task = os.environ.get("TASK", "")
        args_json = os.environ.get("ARGS", "{}")
        
        if not task:
            print(json.dumps({"error": "No task provided"}))
            sys.exit(1)
        
        try:
            args = json.loads(args_json)
        except json.JSONDecodeError:
            args = {}
        
        print(f"[PythonAgent] Received task: {task[:50]}...")
        
        # Map task names to functions
        task_map = {
            "youtube_search": youtube_search_and_play,
            "youtube_play": youtube_play_url,
            "google_search": google_search,
            "gmail_read": gmail_read_latest,
            "gmail_send": gmail_send,
            "maps_search": maps_search,
            "maps_directions": maps_directions,
            "amazon_search": amazon_search,
            "flipkart_search": flipkart_search,
            "get_news": get_latest_news,
            "get_weather": get_weather,
            "whatsapp_send": whatsapp_send,
            "linkedin_jobs": linkedin_search_jobs,
            "fill_form": fill_form,
            "get_page_info": get_page_info,
            "scrape_data": scrape_data,
            "custom": custom_task,
        }
        
        # Determine which function to call
        task_type = args.get("type", "custom")
        func = task_map.get(task_type, custom_task)
        
        # Prepare arguments
        if task_type == "youtube_search":
            result = await func(args.get("query", ""))
        elif task_type == "youtube_play":
            result = await func(args.get("url", ""))
        elif task_type == "google_search":
            result = await func(args.get("query", ""))
        elif task_type == "gmail_read":
            result = await func(args.get("count", 5))
        elif task_type == "gmail_send":
            result = await func(
                args.get("to", ""),
                args.get("subject", ""),
                args.get("body", "")
            )
        elif task_type == "maps_search":
            result = await func(args.get("location", ""))
        elif task_type == "maps_directions":
            result = await func(
                args.get("from", ""),
                args.get("to", ""),
                args.get("mode", "driving")
            )
        elif task_type == "amazon_search":
            result = await func(args.get("product", ""))
        elif task_type == "flipkart_search":
            result = await func(args.get("product", ""))
        elif task_type == "get_news":
            result = await func(args.get("topic", "India"))
        elif task_type == "get_weather":
            result = await func(args.get("city", ""))
        elif task_type == "whatsapp_send":
            result = await func(
                args.get("contact", ""),
                args.get("message", "")
            )
        elif task_type == "linkedin_jobs":
            result = await func(
                args.get("role", ""),
                args.get("location", "India")
            )
        elif task_type == "fill_form":
            result = await func(
                args.get("url", ""),
                args.get("fields", {})
            )
        elif task_type == "get_page_info":
            result = await func(args.get("url", ""))
        elif task_type == "scrape_data":
            result = await func(
                args.get("url", ""),
                args.get("what_to_extract", "")
            )
        else:
            # Custom task - use the task string directly
            print(f"[PythonAgent] Running custom task: {task[:100]}...")
            result = await func(task)
        
        # Output result as JSON
        print(json.dumps({
            "success": True,
            "result": str(result),
            "task_type": task_type
        }))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)

# ============================================================
#  DEMO — test one task at a time
# ============================================================
async def demo():
    print("\n" + "="*55)
    print("  Jarvis Browser Automation")
    print("="*55 + "\n")

    # Uncomment ONE task to test:
    result = await get_weather("Bhopal")
    # result = await youtube_search_and_play("Arijit Singh songs")
    # result = await google_search("best restaurants in Bhopal")
    # result = await get_latest_news("India technology")
    # result = await amazon_search("wireless earphones under 1000")
    # result = await custom_task("Go to irctc.co.in and check trains from Bhopal to Mumbai tomorrow")

    print("\nResult:", result)

if __name__ == "__main__":
    if SUBPROCESS_MODE:
        asyncio.run(subprocess_main())
    else:
        asyncio.run(demo())