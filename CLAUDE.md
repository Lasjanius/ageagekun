# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the "ageagekun" (あげあげくん) project - a document upload automation system for the モバカルネット (Mobakal Net) medical records system. The project automates the process of uploading patient documents to the electronic medical records platform and generates medical reports using Azure OpenAI API (v4.0.0以降).

## Product Requirements Documentation

**重要**: システムの詳細仕様については `docs/PRD.md` を参照してください。PRD.mdは全仕様書へのマスターインデックスとして機能し、各機能の詳細は個別のドキュメントに分割されています。

## Directory Structure
```
allright/
├── CLAUDE.md - Project documentation for Claude
├── .claude/ - Claude system files
└── ageagekun/
    ├── backend/ - Node.js backend server
    ├── frontend/ - Web frontend interface
    ├── schema/
    │   ├── DBschema - Original database schema definition
    │   └── create_schema.sql - Executable SQL for database setup
    ├── docs/
    │   └── inspect.md - UI automation element documentation
    └── test_rpa_trigger.ps1 - RPA trigger test script
```

## Database Architecture (正規化済み)

### PostgreSQL Database: `ageagekun`
- **Connection**: localhost:5432, user: postgres, password: rad1ohead
- **pgpass.conf location**: `C:\Users\hyosh\AppData\Roaming\postgresql\pgpass.conf`

### Master Tables:
1. **care_offices** - 居宅介護支援事業所
   - office_id (SERIAL PRIMARY KEY)
   - name, address
   - created_at, updated_at

2. **care_managers** - ケアマネージャー
   - cm_id (SERIAL PRIMARY KEY)
   - name, office_id (FK to care_offices)
   - created_at, updated_at

3. **visiting_nurse_stations** - 訪問看護ステーション
   - vns_id (SERIAL PRIMARY KEY)
   - name, address, tel
   - created_at, updated_at

4. **patients** - 患者情報（正規化済み）
   - patientID (SERIAL PRIMARY KEY)
   - patientName, address, birthdate
   - cm_id (FK to care_managers)
   - vns_id (FK to visiting_nurse_stations)
   - created_at

5. **Documents** - 文書管理
   - fileID (SERIAL PRIMARY KEY)
   - fileName, patientID (FK to patients)
   - Category, FileType
   - created_at, uploaded_at, isUploaded, pass, base_dir

6. **rpa_queue** - RPA処理キュー
   - id, file_id, patient_id, status
   - created_at, updated_at

### Views:
- **patient_full_view** - 患者情報統合ビュー（全関連情報を結合）
- **cm_workload_view** - ケアマネージャー業務量
- **vns_workload_view** - 訪問看護ステーション業務量
- **office_statistics_view** - 事業所統計

## Azure OpenAI Configuration (v4.0.0以降)

### 環境変数設定
```bash
# .env.local
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-10-21
OPENAI_TEMPERATURE=0.3
```

### テストコマンド
```bash
# Azure OpenAI接続テスト
cd backend && node test-azure-openai.js

# レポート生成機能テスト
cd backend && node test-report-generation.js
```

### 現在の設定 (Sweden Central)
- **リージョン**: Sweden Central
- **モデル**: gpt-4o-mini
- **APIバージョン**: 2024-10-21
- **エンドポイント**: https://hyos-mfrzvno2-swedencentral.services.ai.azure.com

## Common Commands

### Database Operations
```bash
# Connect to PostgreSQL (uses pgpass.conf for auth)
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -w

# Connect to ageagekun database
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w

# Execute SQL file
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -f ageagekun/schema/create_schema.sql

# Check tables
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "\dt"
```

## PostgreSQL Connection Troubleshooting

### Common Issues and Solutions

1. **Password Authentication Fails**
   - **Problem**: `PGPASSWORD` environment variable doesn't work on Windows
   - **Solution**: Create `pgpass.conf` at `C:\Users\hyosh\AppData\Roaming\postgresql\pgpass.conf`
   - **Format**: `localhost:5432:*:postgres:rad1ohead`
   - **Use**: Add `-w` flag to psql commands to use pgpass.conf

2. **Command Timeouts**
   - **Problem**: psql hangs waiting for password input
   - **Solution**: Always use `-w` flag with pgpass.conf configured
   - **Never**: Don't use `echo password | psql` - it still times out

3. **CREATE DATABASE Syntax**
   - **Problem**: PostgreSQL doesn't support `IF NOT EXISTS` with CREATE DATABASE
   - **Correct**: `CREATE DATABASE ageagekun;`
   - **Wrong**: `CREATE DATABASE IF NOT EXISTS ageagekun;`

4. **Service Check**
   ```bash
   # Check if PostgreSQL service is running
   sc query postgresql-x64-17
   
   # Check if port 5432 is listening
   netstat -an | findstr :5432
   ```

5. **Alternative Connection Methods**
   - pgAdmin 4 (GUI) - Easier for manual operations
   - Use absolute paths for psql.exe
   - Always specify `-h localhost` to avoid socket connection issues

## Test Tools

### Care Management System Test Script
**File**: `test_care_management.ps1`

PowerShell script for managing the normalized database structure:

```powershell
# Setup tables and views
.\test_care_management.ps1 -Mode Setup

# Migrate existing data (CMName → cm_id)
.\test_care_management.ps1 -Mode Migrate

# Complete normalization (remove legacy columns)
.\test_care_management.ps1 -Mode Normalize

# Insert test data
.\test_care_management.ps1 -Mode Test

# Reset system (DANGER!)
.\test_care_management.ps1 -Mode Reset
```

### RPA Queue Trigger Test Script
**File**: `test_rpa_trigger.ps1`

This PowerShell script automates testing of the rpa_queue trigger system, which handles document upload status updates and file movements.

#### Features:
- Tests the complete trigger flow (rpa_queue → Documents → file movement)
- Shows real-time status of database tables and file locations
- Includes reset functionality to restore initial state
- Color-coded output for easy reading

#### Usage:
```powershell
# Test with default file (FileId=5)
.\test_rpa_trigger.ps1

# Test with specific file
.\test_rpa_trigger.ps1 -FileId 3

# Reset after test (restore to pending state)
.\test_rpa_trigger.ps1 -FileId 5 -Reset

# Show help
.\test_rpa_trigger.ps1 -Help
```

#### What the script tests:
1. **Trigger Activation**: Changes rpa_queue status from 'pending' to 'done'
2. **Database Updates**: Verifies Documents table updates (isUploaded=true, uploaded_at timestamp)
3. **File Movement**: Confirms file moves to uploaded/ folder
4. **WebSocket Notifications**: Triggers pg_notify for real-time frontend updates

#### Common Test Scenarios:
```powershell
# Full cycle test
.\test_rpa_trigger.ps1 -FileId 5        # Run test
.\test_rpa_trigger.ps1 -FileId 5 -Reset # Reset to original state

# Test multiple files sequentially
1..10 | ForEach-Object { .\test_rpa_trigger.ps1 -FileId $_ }
```

## Automation Flow

The system automates document uploads to モバカルネット with the following UI automation sequence:
1. Search for patient by ID (99999999)
2. Navigate to 書類BOX (Document Box)
3. Click 書類追加 (Add Document)
4. Select file from `C:\Users\hyosh\Desktop\allright\ageagekun\patients\[patientID]\`
5. Set category (e.g., 居宅)
6. Submit upload

Key UI elements use AutomationId:
- Patient search: `patient_search_top`
- Category selection: `category_id_select`
- File name input: `1148`

## API Endpoints

### Backend Server
- **Base URL**: http://localhost:3000
- **WebSocket**: ws://localhost:3000

### Patient API Endpoints
- `GET /api/patients/all` - 全患者一覧
- `GET /api/patients/:id` - 患者詳細情報
- `GET /api/patients/:id/report-data` - レポート用データ
- `GET /api/patients/:id/kyotaku-report` - 居宅療養管理指導報告書データ

### Document API Endpoints
- `GET /api/documents/pending-uploads` - アップロード待ちドキュメント
- `GET /api/documents/all` - 全ドキュメント一覧

### Queue API Endpoints
- `POST /api/queue/create-batch` - バッチキュー作成
- `GET /api/queue/:id/status` - キューステータス確認
- `PUT /api/queue/:id/complete` - 完了マーク

## Features

### 1. Document Upload Automation
- RPA連携による自動アップロード
- WebSocket通知でリアルタイム更新
- トリガーによる自動ファイル移動

### 2. 居宅療養管理指導報告書生成
- **HTMLテンプレート**: `frontend/templates/kyotaku_report_template.html`
- **JavaScript生成器**: `frontend/js/report_generator.js`
- **使用方法**: `?patientId=1` パラメータで自動生成

### 3. Database Normalization
- 完全正規化されたデータ構造
- 外部キー制約による整合性保証
- ビューによる統合データアクセス

## Development Notes

- PostgreSQL 17 is installed at `C:\Program Files\PostgreSQL\17\`
- Node.js backend with Express.js
- The project uses Windows environment with Japanese locale
- UI automation targets the モバカルネット web application
- Document files are organized by patient ID in separate folders

## Troubleshooting

### PowerShell Script Encoding Issues

When working with Japanese filenames in PowerShell scripts, encoding issues may occur. Here are reliable workarounds:

#### Manual Reset Procedure (Recommended)

If `test_rpa_trigger.ps1` fails with encoding errors, use these commands directly:

```bash
# Step 1: Get Queue Information
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "SELECT id, file_id, patient_id, status FROM rpa_queue WHERE id = [QUEUE_ID];"

# Step 2: Reset Queue Status to pending
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE rpa_queue SET status = 'pending' WHERE id = [QUEUE_ID];"

# Step 3: Reset Documents Table (IMPORTANT: Must also reset path fields!)
# ⚠️ CRITICAL: Always reset pass and base_dir to remove '\uploaded' from paths
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE Documents SET isUploaded = FALSE, uploaded_at = NULL, pass = REPLACE(pass, '\\uploaded', ''), base_dir = REPLACE(base_dir, '\\uploaded', '') WHERE fileID = [FILE_ID];"

# Step 4: Move Files Back from uploaded/ folder
powershell -Command "Get-ChildItem 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\[PATIENT_ID]\uploaded\*.pdf' | Move-Item -Destination 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\[PATIENT_ID]' -Force"

# Step 5: Delete Queue Record (Final Cleanup)
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "DELETE FROM rpa_queue WHERE id = [QUEUE_ID];"

# Verify Reset
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "SELECT id, file_id, status FROM rpa_queue WHERE id = [QUEUE_ID]; SELECT fileID, isUploaded FROM Documents WHERE fileID = [FILE_ID];"
```

Replace `[QUEUE_ID]`, `[FILE_ID]`, and `[PATIENT_ID]` with actual values.

#### Example: Reset Queue ID 11
```bash
# Assuming queue_id=11, file_id=5, patient_id=99999998
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE rpa_queue SET status = 'pending' WHERE id = 11;"
# ⚠️ IMPORTANT: Must reset path fields to avoid double '\uploaded\uploaded' issue!
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE Documents SET isUploaded = FALSE, uploaded_at = NULL, pass = REPLACE(pass, '\\uploaded', ''), base_dir = REPLACE(base_dir, '\\uploaded', '') WHERE fileID = 5;"
powershell -Command "Get-ChildItem 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998\uploaded\*.pdf' | Move-Item -Destination 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999998' -Force"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "DELETE FROM rpa_queue WHERE id = 11;"
```

#### Creating a Batch File (Alternative)

Save as `reset_queue_by_id.bat`:
```batch
@echo off
setlocal EnableDelayedExpansion

set /p QUEUE_ID="Enter Queue ID to reset: "

REM Get file_id and patient_id
for /f "tokens=1,2,3 delims=|" %%a in ('"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -t -c "SELECT file_id, patient_id FROM rpa_queue WHERE id = %QUEUE_ID%;"') do (
    set FILE_ID=%%a
    set PATIENT_ID=%%b
)

echo Resetting Queue ID: %QUEUE_ID% (File: %FILE_ID%, Patient: %PATIENT_ID%)

REM Reset operations
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE rpa_queue SET status = 'pending' WHERE id = %QUEUE_ID%;"
REM CRITICAL: Reset path fields to prevent double '\uploaded\uploaded' issue
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "UPDATE Documents SET isUploaded = FALSE, uploaded_at = NULL, pass = REPLACE(pass, '\\uploaded', ''), base_dir = REPLACE(base_dir, '\\uploaded', '') WHERE fileID = %FILE_ID%;"
powershell -Command "if (Test-Path 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\%PATIENT_ID%\uploaded') { Get-ChildItem 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\%PATIENT_ID%\uploaded\*.pdf' | Move-Item -Destination 'C:\Users\hyosh\Desktop\allright\ageagekun\patients\%PATIENT_ID%' -Force }"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "DELETE FROM rpa_queue WHERE id = %QUEUE_ID%;"

echo Reset completed!
pause
```

#### Root Cause
- PowerShell scripts may have issues with UTF-8/Shift-JIS encoding when processing Japanese characters
- SQL statements containing Japanese text (like ケアプラン.pdf) can cause encoding errors
- Using Queue IDs and File IDs instead of Japanese filenames avoids these issues

## Codex MCP Usage

### Overview
Codex MCP is a tool that can execute complex tasks autonomously without interactive prompts. This is useful for file analysis, code understanding, and automated operations.

### Basic Usage
```python
# Use mcp__codex__codex function with the following parameters:
mcp__codex__codex(
    prompt="Your task description here",
    approval-policy="never",      # No interactive approval needed
    sandbox="read-only",          # Safe read-only mode
    cwd="C:\Users\hyosh\Desktop\allright\ageagekun"  # Working directory
)
```

### Available Approval Policies
- `untrusted` - Requires approval for potentially unsafe operations
- `on-failure` - Requires approval when commands fail
- `on-request` - Requires approval when requested
- `never` - No approval required (recommended for automation)

### Sandbox Modes
- `read-only` - Can only read files, no modifications
- `workspace-write` - Can modify files in the workspace
- `danger-full-access` - Full system access (use with caution)

### Example: File Analysis Task
```python
# Example of reading and summarizing a file without interaction
mcp__codex__codex(
    prompt="Read the CLAUDE.md file and summarize its main sections",
    approval-policy="never",
    sandbox="read-only",
    cwd="C:\Users\hyosh\Desktop\allright\ageagekun"
)
```

### Common Use Cases
1. **File Structure Analysis** - Analyze project structure and dependencies
2. **Code Understanding** - Summarize code functionality and architecture
3. **Documentation Generation** - Generate documentation from code
4. **Data Analysis** - Analyze log files or data files
5. **Automated Testing** - Run tests and analyze results

### Tips
- Always use `approval-policy="never"` for non-interactive execution
- Use `sandbox="read-only"` for safety when only reading files
- Specify the correct `cwd` for your working directory
- The tool can handle complex multi-step tasks autonomously
