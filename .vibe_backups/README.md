# Vibe Coder Pro 🚀

An advanced AI-powered coding assistant that runs in your terminal. Vibe Coder Pro acts as your AI pair programmer, helping you write, analyze, and manage code with autonomous capabilities.

## Features

- 🤖 **AI-Powered Code Generation** - Uses Qwen3-Coder-480B for intelligent code assistance
- 👁️ **Vision-to-Code** - Paste images and convert UI designs to code
- 🔄 **Autonomous Task Execution** - Work through to-do lists independently
- 👥 **Real-Time Collaboration** - Code together with team members
- 🔍 **Code Analysis** - Get insights on code quality, security, and performance
- 📚 **Code Explanation** - Understand complex code with AI explanations
- 🛡️ **File Safety** - Automatic backups and rollback capabilities

## Prerequisites

- Node.js 18+
- Windows OS (for clipboard functionality)
- Hyperbolic API key

## Installation

```bash
git clone <repository-url>
cd vibe-coder-pro
npm install
```

## Setup

1. Get your Hyperbolic API key from [Hyperbolic](https://hyperbolic.xyz)
2. Set the environment variable:
   ```bash
   # Windows
   set HYPERBOLIC_API_KEY=your_api_key_here
   
   # Mac/Linux
   export HYPERBOLIC_API_KEY=your_api_key_here
   ```

## Usage

```bash
npm start
```

### Commands

- `/help` - Show all available commands
- `/vision [prompt]` - Analyze clipboard image and generate code
- `/todo` - Show active tasks
- `/analyze [file]` - Analyze code for issues
- `/explain [code]` - Explain code functionality
- `/context` - Show project context
- `/collab start [port]` - Start collaboration server
- `/revert` - Rollback last changes
- `/reset` - Clear memory and history
- `/clear` - Clear terminal screen

## Project Structure

```
.vibe_analysis/      # Code analysis cache
.vibe_backups/       # File backup storage
.vibe_collab/        # Collaboration session data
.vibe_explanations/  # Code explanation cache
```

## How It Works

Vibe Coder Pro uses a "Senior AI Architect" that can:
- Create and edit files autonomously
- Run terminal commands (with your permission)
- Analyze and explain code
- Manage tasks independently
- Collaborate with other developers in real-time

The AI communicates through XML-like commands:
- `<write file="path.js">code