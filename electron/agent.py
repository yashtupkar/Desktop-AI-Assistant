import asyncio
from browser_use import Agent, BrowserSession, BrowserProfile
from langchain_openai import ChatOpenAI

# ============================================================
#  CONFIG — paste your OpenRouter key here
# ============================================================
OPENROUTER_API_KEY = "REMOVED_SEE_ENV_FILE"; 
DEFAULT_MODEL      = "google/gemini-2.5-flash-lite"  # Free model
# ============================================================

def get_llm(model: str = DEFAULT_MODEL):
    return ChatOpenAI(
        model=model,
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
        default_headers={
            "HTTP-Referer": "http://localhost",
            "X-Title": "Jarvis Desktop",
        }
    )

# --- Shared persistent browser session ---
_session: BrowserSession | None = None

async def get_session() -> BrowserSession:
    global _session
    if _session is None:
        print("[Browser] Launching browser session...")
        _session = BrowserSession(
            headless=False,
            extra_chromium_args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        await _session.start()
    return _session

async def close_browser():
    global _session
    if _session:
        await _session.stop()
        _session = None
        print("[Browser] Closed")

# ============================================================
#  CORE — run any task in natural language
# ============================================================
async def run_task(task: str, model: str = DEFAULT_MODEL) -> str:
    print(f"\n[Jarvis] Task: {task.strip()[:80]}...")
    session = await get_session()
    agent = Agent(
        task=task,
        llm=get_llm(model),
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
#  DEMO — test one task at a time
# ============================================================
async def demo():
    print("\n" + "="*55)
    print("  Jarvis Browser Automation")
    print("="*55 + "\n")

    try:
        # Uncomment ONE task to test:
        result = await get_weather("Bhopal")
        # result = await youtube_search_and_play("Arijit Singh songs")
        # result = await google_search("best restaurants in Bhopal")
        # result = await get_latest_news("India technology")
        # result = await amazon_search("wireless earphones under 1000")
        # result = await custom_task("Go to irctc.co.in and check trains from Bhopal to Mumbai tomorrow")

        print("\nResult:", result)

    finally:
        await close_browser()

if __name__ == "__main__":
    asyncio.run(demo())