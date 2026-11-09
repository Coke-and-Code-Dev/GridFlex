# GridFlex dashboard

From the repository root, with Python 3.11 and the prepared data in place:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn api.main:app --reload
```

In a second terminal:

```powershell
cd ui
npm ci
npm run dev
```

Wait until the API prints "Application startup complete" (about 20 seconds). Open the URL printed by Vite, go to **Setup** and press **Optimize**: the default inputs are the development scenario (sector transport and storage, the current month, 8,000 kWh a month, 10 vans, 100 kW). Increase the fleet from 10 to 12 and rerun to see the previous result in the explanation. The default API URL is http://127.0.0.1:8000. Set VITE_GRIDFLEX_API_URL for a different local API address.

Explanations come from Groq or a local Qwen model, grounded in computed facts, with deterministic templates as the fallback (see below). Replay metrics describe held-out synthetic load windows. The local Approve and Reject controls record the decision for the current session.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Explainable AI and Groq

The API reads `GROQ_API_KEY` from its environment or the Git-ignored root `.env` file. Set it locally and restart the API after changing the key. Never commit the key. The default model is `openai/gpt-oss-120b`; `GROQ_MODEL` may override it server-side. Groq receives the user's question, recent conversation, curated project knowledge, and computed synthetic evidence. It writes a grounded response with evidence placeholders; the server validates references and inserts the computed statements. Numerical checking reduces hallucination but does not prove semantic correctness. Chat can request the three fixed what-if comparisons or earlier departures in 15-minute steps for explicitly named vans; other arbitrary edits are not supported through chat. If Groq is unavailable or returns invalid output, the deterministic template is used.

After a run, use the demand-chart slider to inspect a planning interval and the What-if scenarios panel in Analysis to run one-change comparisons. Comparisons use the same synthetic windows; the solver is deterministic, so rerunning the same inputs gives the same plan. Battery replay clips negative net demand without recomputing battery state per window.

## Local Qwen option

The Explanation tab lets you choose Groq or a local Ollama model. Single-depot explanations default to `qwen3.5:9b`; portfolio questions default to `qwen3:4b-instruct`. Install the relevant model and start Ollama. To use the 9B model for portfolio questions, start the API with `GRIDFLEX_PORTFOLIO_OLLAMA_MODEL=qwen3.5:9b` in its environment. Ollama is called by the Python API at `127.0.0.1:11434`; the browser never calls the model directly. Both providers use the same computed facts and evidence validation. If the selected provider is unavailable or fails validation, a local template is used. Questions and computed synthetic evidence are sent to Groq when Groq is selected; with Ollama they remain on the local server. Switching providers does not alter the schedule.


## CSV setup and multi-site reports

The CSV templates are in `ui/public/`. Use one row per van. Repeat the site settings for every row sharing a `site_id`. Use Dutch postcodes, 15-minute clock times in the noon-to-noon planning window, and a business profile from the dropdown (preserve the leading zero in category `009`). Enter risk tolerance as a percentage, such as `5`. The examples use synthetic fleet data and real postcode keys for the indicative capacity map.

- **Upload setup CSV** in Setup expects a single site. Review the imported settings, then press **Optimize**.
- **Multi-depot simulation** in Setup accepts multiple site IDs. An upload opens the Multi-depot results tab, where you can inspect each site's results. The dashboard shows progress and flags sites that fail to simulate. When the run completes, **Download full PDF report** exports a portfolio overview, per-site charts and per-van charging results. GridFlex does not enforce a CSV file-size cap. Large runs are limited by browser and server memory, network settings, and solver time. Each site supports up to 40 vans.


Portfolio questions use the API’s local SQLite results and local keyword retrieval over project documentation. Groq requires its server-side API key; local Qwen requires a running Ollama service and the configured model. Portfolio results persist in the git-ignored `.gridflex-local/` directory. The repository also contains an optional Chroma-based retriever, but the portfolio assistant currently uses keyword retrieval.
