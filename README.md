# LocalMind

A ChatGPT-style chat app for **Android** and **Windows** that talks to open-source models from Hugging Face running on a free cloud GPU (Google Colab or Kaggle).

Paste a Hugging Face link, get a ready-to-run notebook, run it, paste the link it prints into the app, and chat.

## How it works

```
Phone / PC app  --->  free public tunnel  --->  Colab or Kaggle GPU
(LocalMind)           (Cloudflare)              llama.cpp or vLLM
                                                running your model
```

The notebook starts an OpenAI-compatible server and prints a **Server URL** and an **API key**. The app uses them to stream replies. The URL changes every session, and the key stops anyone else from using your server.

## Features

- Chat with streaming replies, a Stop button, and a status dot for the server connection
- **Model screen:** paste any Hugging Face link and the app generates the notebook for you
  - Picks the best GGUF file that fits your GPU (llama.cpp), or full weights via vLLM
  - Handles gated models (Colab asks for your Hugging Face token)
  - Warns when a model is too big, low quality at that size, or Apple-only (MLX/JANG)
  - For Apple-only models, searches Hugging Face for GGUF versions that run on free GPUs
- **GPU choices:** Colab T4 (free, 16 GB), Kaggle 2×T4 (free, 30 GB), L4 or A100 (paid Colab)
- **Photos:** attach a picture with the 📎 button (vision models only)
- Copy the code into a notebook cell, or download a `.ipynb` on Windows

## Quick start

1. **Get the app.** Download the APK or the Windows `.exe` from the repo's **Releases** page.
2. **Make a notebook.** Open the app, tap **Model**, paste a Hugging Face link, choose your GPU, tap **Generate notebook**.
3. **Run it.**
   - Colab: open [colab.new](https://colab.new), paste the code into one cell, set Runtime to a GPU, run.
   - Kaggle: new notebook, Accelerator **GPU T4 x2**, Internet **On**, paste, run. Needs a phone-verified account.
4. **Connect.** When the cell finishes it prints `Server URL` and `API key`. Paste both under **Server** in the app.
5. **Chat.**

The first run builds llama.cpp for your GPU, which takes about 8 minutes. Model download time depends on its size.

## Picking a model

| You have | Good fit |
|---|---|
| Colab T4 (16 GB) | Up to about 12 GB files (7B at Q4, or a 31B at Q2) |
| Kaggle 2×T4 (30 GB) | Files up to about 24 GB (a 31B at Q4 or Q5) |
| L4 / A100 (paid) | Larger files or higher quality |

Notes:

- Lower quantization (Q2, Q3) means lower quality. Use a bigger GPU when you can.
- Models in **MLX / JANG** format are built for Apple Silicon Macs and can't run on Colab or Kaggle. The app suggests GGUF alternatives, which are other people's conversions and may behave differently.
- Photos only work with vision models. For GGUF, the repo must include an `mmproj` file.

## Building and releasing

GitHub Actions (`.github/workflows/build.yml`) builds everything on every push to `main`:

- **Android:** Capacitor wraps `www/` into a debug APK (installable, not Play Store signed)
- **Windows:** Electron builds an installer and a portable `.exe`
- **Release:** a release named `LocalMind v1.0.N` is created with both files attached

One-time setup in your repo: **Settings → Actions → General → Workflow permissions → Read and write permissions**.

To run it on your PC without GitHub:

```
npm install
npm start            # run the desktop app
npm run dist:win     # build the Windows installer
```

## Project layout

```
www/index.html            chat app (UI, streaming, photos)
www/colab.js              Hugging Face link -> notebook generator
electron/main.js          Windows app shell
capacitor.config.json     Android wrapper settings
assets/icon-only.png      Android icon source
build/icon.png            Windows icon
.github/workflows/        build + release pipeline
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Release step fails with a permissions error | Set Workflow permissions to Read and write (see above) |
| "GitHub Personal Access Token is not set" | Make sure `dist:win` uses `--publish never` (it does in this repo) |
| Status dot stays grey | The notebook stopped or the link changed. Rerun it and paste the new URL and key |
| "Server answered 401" | The API key doesn't match the current session |
| Colab disconnects | Free sessions time out when idle. Rerun the notebook |
| Photo error | The model isn't a vision model, or the GGUF repo has no `mmproj` file |
| Commits show someone else's name | Set `git config user.name` and `user.email` to your own |

## Notes

- The tunnel URL is public but protected by the API key. Don't share the key.
- The app stores the server URL and key on your device only.
- Check each model's license on its Hugging Face page before using it.
