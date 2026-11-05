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

Open the URL printed by Vite and choose **Development scenario**, then **Optimize**. Increase the fleet from 10 to 12 and rerun to see the previous result in the explanation. The default API URL is http://127.0.0.1:8000. Set VITE_GRIDFLEX_API_URL for a different local API address.

The explanation uses deterministic templates until the team selects a provider. Replay metrics describe held-out synthetic load windows. The local Approve and Reject controls record the decision for the current session.

# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Explainable AI and Groq

The API reads `GROQ_API_KEY` from its environment or the Git-ignored root `.env` file. Set it locally and restart the API after changing the key. Never commit the key. The default model is `openai/gpt-oss-120b`; `GROQ_MODEL` may override it server-side. Groq receives the user's question, recent conversation, curated project knowledge, and computed synthetic evidence. It writes a grounded response with evidence placeholders; the server validates references and inserts the computed statements. Numerical checking reduces hallucination but does not prove semantic correctness. Chat can request the three fixed what-if comparisons or earlier departures in 15-minute steps for explicitly named vans; other arbitrary edits are not supported through chat. If Groq is unavailable or returns invalid output, the deterministic template is used.

After a run, use the demand-chart slider to inspect a planning interval and the Explain this decision section to run one-change comparisons. Comparisons use synthetic windows and may vary across equally optimal schedules. Battery replay clips negative net demand without recomputing battery state per window.

## Local Qwen option

The Explanation tab lets you choose Groq or the local Ollama model `qwen3.5:9b` for subsequent questions or optimization. Start Ollama and ensure that model is installed. Ollama is called by the Python API at `127.0.0.1:11434`; the browser never calls the model directly. Both providers use the same computed facts and evidence validation. If the selected provider is unavailable or fails validation, a local template is used. Questions and computed synthetic evidence are sent to Groq when Groq is selected; with Ollama they remain on the local server. Switching providers does not alter the schedule.


## CSV setup and multi-site reports

From **Setup**, download either example CSV. Use one row per van. Repeat the site settings for every row sharing a `site_id`. Use Dutch postcodes, 15-minute clock times in the noon-to-noon planning window, and a business profile from the dropdown (preserve the leading zero in category `009`). Enter risk tolerance as a percentage, such as `5`. The examples use synthetic fleet data and real postcode keys for the indicative capacity map.

- **Upload and optimize** expects a single site and opens the charging plan when ready.
- **Multi-site simulation and PDF** accepts multiple site IDs. **Run three-depot sample** generates the example report directly. The upload limit is 2 MB and each site supports up to 40 vans.
