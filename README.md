# Open Lovable (Self-Hosted)

🚀 **Fully self-hostable** chat interface to build React apps instantly. No external API dependencies required!

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

## ✨ Features

- **🏠 Fully Self-Hosted**: No external API dependencies required
- **🤖 Custom LLM Support**: Use any OpenAI-compatible API (Ollama, LocalAI, etc.)
- **📁 Local Sandboxes**: Code execution in isolated local folders
- **🔥 Self-Hosted Firecrawl Simple**: Lightweight web scraping with anti-bot capabilities
- **🐳 Docker Ready**: Complete Docker Compose stack with Firecrawl Simple included
- **⚡ Real-time Preview**: Live Vite development server for each sandbox

## 🚀 Quick Start with Docker (Recommended)

1. **Clone the repository**
```bash
git clone https://github.com/pump-bear/open-lovable2.git
cd open-lovable2
```

2. **Run the setup script**
```bash
./setup.sh
```

3. **Access the application**
   - Open http://localhost:3000
   - Configure your LLM endpoint in the web interface
   - Start building React apps!

## 🛠️ Manual Setup (Development)

1. **Clone & Install**
```bash
git clone https://github.com/pump-bear/open-lovable2.git
cd open-lovable2
npm install
```

2. **Install Playwright browsers**
```bash
npx playwright install
```

3. **Configure environment (optional)**
```bash
cp .env.example .env.local
# Edit .env.local if needed (most config is done in the web UI)
```

4. **Run development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔧 LLM Configuration

Configure your LLM endpoint directly in the web interface:

### Supported APIs
- **Ollama**: `http://localhost:11434/v1`
- **LocalAI**: `http://localhost:8080/v1`
- **LM Studio**: `http://localhost:1234/v1`
- **OpenAI**: `https://api.openai.com/v1`
- **Any OpenAI-compatible API**

### Example Configurations

**Ollama (Local)**
- URL: `http://localhost:11434/v1`
- API Key: `ollama` (or leave empty)
- Model: `llama3.2` (or any model you have installed)

**LocalAI (Local)**
- URL: `http://localhost:8080/v1`
- API Key: (leave empty or set your key)
- Model: `gpt-3.5-turbo` (or your model name)

**OpenAI (Cloud)**
- URL: `https://api.openai.com/v1`
- API Key: `your-openai-api-key`
- Model: `gpt-4` or `gpt-3.5-turbo`

## 📁 File Structure

```
open-lovable2/
├── app/                    # Next.js app directory
├── sandboxes/             # Local sandboxes (auto-created)
├── data/                  # Persistent application data
├── docker-compose.yml     # Docker stack with Firecrawl Simple
├── Dockerfile            # Main app container
└── setup.sh              # Quick setup script
```

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build -d

# Clean up
docker-compose down -v
```

## 🆚 Differences from Original

This self-hosted version removes all external dependencies:

| Feature | Original | Self-Hosted |
|---------|----------|-------------|
| Code Execution | E2B Cloud Sandboxes | Local folder sandboxes |
| Web Scraping | Firecrawl Cloud API | Self-hosted Firecrawl Simple |
| LLM APIs | Fixed provider list | Any OpenAI-compatible API |
| Infrastructure | Cloud dependencies | Fully self-contained |
| Cost | Pay per usage | Free (your infrastructure) |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT
