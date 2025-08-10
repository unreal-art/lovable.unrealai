import { NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
}

export async function GET() {
  try {
    if (!global.activeSandbox) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active sandbox' 
      }, { status: 400 });
    }
    
    console.log('[monitor-vite-logs] Checking Vite process logs...');
    
    // Enhanced error detection with file paths and line numbers
    const result = await global.activeSandbox.runCode(`
import json
import subprocess
import re
import os
import time

errors = []

def parse_error_details(error_text, file_context=""):
    """Parse error text to extract detailed information"""
    error_info = {
        "type": "unknown",
        "message": error_text.strip(),
        "file": None,
        "line": None,
        "column": None,
        "stack": None,
        "severity": "error"
    }
    
    # Pattern for file paths with line numbers (common in Vite errors)
    file_line_patterns = [
        r'([^\\s]+\\.(?:jsx?|tsx?|css|vue)):(\\d+):(\\d+)',  # file.js:10:5
        r'([^\\s]+\\.(?:jsx?|tsx?|css|vue)):(\\d+)',        # file.js:10
        r'at ([^\\s]+\\.(?:jsx?|tsx?|css|vue)):(\\d+):(\\d+)', # stack trace format
    ]
    
    for pattern in file_line_patterns:
        match = re.search(pattern, error_text)
        if match:
            error_info["file"] = match.group(1)
            error_info["line"] = int(match.group(2))
            if len(match.groups()) >= 3:
                error_info["column"] = int(match.group(3))
            break
    
    # Detect error types
    if "Failed to resolve import" in error_text:
        error_info["type"] = "import-error"
        import_match = re.search(r'Failed to resolve import "([^"]+)"', error_text)
        if import_match:
            error_info["import"] = import_match.group(1)
    elif "SyntaxError" in error_text:
        error_info["type"] = "syntax-error"
    elif "TypeError" in error_text:
        error_info["type"] = "type-error"
    elif "ReferenceError" in error_text:
        error_info["type"] = "reference-error"
    elif "Cannot resolve dependency" in error_text:
        error_info["type"] = "dependency-error"
    elif "Parse failure" in error_text:
        error_info["type"] = "parse-error"
    
    # Extract stack trace if available
    stack_match = re.search(r'(    at [^\\n]+(?:\\n    at [^\\n]+)*)', error_text, re.MULTILINE)
    if stack_match:
        error_info["stack"] = stack_match.group(1)
    
    return error_info

# First check the error file
try:
    with open('/tmp/vite-errors.json', 'r') as f:
        data = json.load(f)
        for error in data.get('errors', []):
            parsed_error = parse_error_details(error.get('message', ''))
            parsed_error.update(error)  # Merge with existing data
            errors.append(parsed_error)
except:
    pass

# Enhanced log scanning with better error parsing
try:
    # Check Vite-related log files
    log_locations = [
        '/tmp',
        '/home/user/app',
        '/var/log'
    ]
    
    log_files = []
    for location in log_locations:
        if os.path.exists(location):
            for root, dirs, files in os.walk(location):
                for file in files:
                    if any(keyword in file.lower() for keyword in ['vite', 'build', 'dev', 'npm']) and file.endswith('.log'):
                        log_files.append(os.path.join(root, file))
    
    # Also check for recent console output
    console_files = ['/tmp/vite-console.log', '/tmp/dev-server.log']
    log_files.extend([f for f in console_files if os.path.exists(f)])
    
    for log_file in log_files[:10]:  # Check up to 10 log files
        try:
            with open(log_file, 'r') as f:
                content = f.read()
                
                # Split content into lines for better parsing
                lines = content.split('\\n')
                
                # Look for various error patterns
                error_patterns = [
                    r'ERROR[^\\n]*',
                    r'Error[^\\n]*',
                    r'Failed to[^\\n]*',
                    r'Cannot[^\\n]*',
                    r'SyntaxError[^\\n]*',
                    r'TypeError[^\\n]*',
                    r'ReferenceError[^\\n]*',
                    r'\\[vite\\] Internal server error[^\\n]*'
                ]
                
                for i, line in enumerate(lines):
                    for pattern in error_patterns:
                        if re.search(pattern, line, re.IGNORECASE):
                            # Collect context around the error
                            start_idx = max(0, i - 2)
                            end_idx = min(len(lines), i + 5)
                            context_lines = lines[start_idx:end_idx]
                            full_error = '\\n'.join(context_lines)
                            
                            parsed_error = parse_error_details(full_error)
                            
                            # Add timestamp if we can extract it
                            timestamp_match = re.search(r'\\d{2}:\\d{2}:\\d{2}', line)
                            if timestamp_match:
                                parsed_error["timestamp"] = timestamp_match.group(0)
                            
                            # Avoid duplicates based on message content
                            if not any(e.get('message', '') == parsed_error['message'] for e in errors):
                                errors.append(parsed_error)
                            break
                
                # Special handling for import errors with better package extraction
                import_errors = re.findall(r'Failed to resolve import "([^"]+)"[^\\n]*(?:\\n[^\\n]*){0,3}', content, re.MULTILINE)
                for import_path in import_errors:
                    if not import_path.startswith('.'):
                        # Extract base package name more accurately
                        if import_path.startswith('@'):
                            parts = import_path.split('/')
                            package_name = '/'.join(parts[:2]) if len(parts) >= 2 else import_path
                        else:
                            package_name = import_path.split('/')[0]
                        
                        error_obj = {
                            "type": "npm-missing",
                            "package": package_name,
                            "import": import_path,
                            "message": f"Failed to resolve import \\"{import_path}\\"",
                            "file": "Unknown",
                            "severity": "error",
                            "fixable": True
                        }
                        
                        # Avoid duplicates
                        if not any(e.get('package') == error_obj['package'] for e in errors):
                            errors.append(error_obj)
        except Exception as file_error:
            print(f"Error reading {log_file}: {file_error}")
            pass
except Exception as e:
    print(f"Error scanning logs: {e}")

# Try to get real-time Vite process output
try:
    # Check if Vite process is running and capture recent output
    result = subprocess.run(['pgrep', '-f', 'vite'], capture_output=True, text=True)
    if result.returncode == 0:
        pids = result.stdout.strip().split('\\n')
        for pid in pids[:3]:  # Check up to 3 Vite processes
            try:
                # Try to get recent stderr/stdout
                proc_files = [f'/proc/{pid}/fd/1', f'/proc/{pid}/fd/2']  # stdout, stderr
                for proc_file in proc_files:
                    if os.path.exists(proc_file):
                        try:
                            # This might not always work due to permissions
                            with open(proc_file, 'r') as f:
                                recent_output = f.read(4096)  # Read last 4KB
                                if recent_output and ('error' in recent_output.lower() or 'failed' in recent_output.lower()):
                                    parsed_error = parse_error_details(recent_output)
                                    parsed_error["source"] = "live-process"
                                    if not any(e.get('message') == parsed_error['message'] for e in errors):
                                        errors.append(parsed_error)
                        except:
                            pass
            except:
                continue
except:
    pass

# Deduplicate and prioritize errors
unique_errors = []
seen_messages = set()
for error in errors:
    error_signature = f"{error.get('type', 'unknown')}:{error.get('message', '')[:100]}"
    if error_signature not in seen_messages:
        seen_messages.add(error_signature)
        
        # Add additional metadata for better error handling
        if error.get('file') and not error['file'].startswith('/'):
            # Convert relative paths to absolute
            error['file'] = f"/home/user/app/{error['file']}"
        
        # Mark as fixable if it's a common fixable error type
        if error.get('type') in ['npm-missing', 'import-error', 'syntax-error', 'reference-error']:
            error['fixable'] = True
        
        unique_errors.append(error)

# Sort by severity and recency
unique_errors.sort(key=lambda x: (
    0 if x.get('severity') == 'error' else 1,
    0 if x.get('fixable') else 1
))

print(json.dumps({"errors": unique_errors, "total_count": len(unique_errors)}))
    `, { timeout: 5000 });
    
    const data = JSON.parse(result.output || '{"errors": []}');
    
    return NextResponse.json({
      success: true,
      hasErrors: data.errors.length > 0,
      errors: data.errors
    });
    
  } catch (error) {
    console.error('[monitor-vite-logs] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}