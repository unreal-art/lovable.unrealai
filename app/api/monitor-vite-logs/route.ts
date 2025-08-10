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
    
    // Simplified error detection with much shorter timeout
    const result = await global.activeSandbox.runCode(`
import json
import os
import re

errors = []

def parse_simple_error(error_text):
    """Simple error parsing without complex operations"""
    error_info = {
        "type": "unknown",
        "message": error_text.strip(),
        "file": None,
        "severity": "error",
        "fixable": False
    }
    
    # Basic error type detection
    if "Failed to resolve import" in error_text:
        error_info["type"] = "import-error"
        error_info["fixable"] = True
        import_match = re.search(r'Failed to resolve import "([^"]+)"', error_text)
        if import_match:
            import_path = import_match.group(1)
            error_info["import"] = import_path
            # Extract package name
            if not import_path.startswith('.'):
                if import_path.startswith('@'):
                    parts = import_path.split('/')
                    error_info["package"] = '/'.join(parts[:2]) if len(parts) >= 2 else import_path
                else:
                    error_info["package"] = import_path.split('/')[0]
                error_info["type"] = "npm-missing"
    elif "SyntaxError" in error_text:
        error_info["type"] = "syntax-error"
        error_info["fixable"] = True
    elif "TypeError" in error_text:
        error_info["type"] = "type-error"
    elif "ReferenceError" in error_text:
        error_info["type"] = "reference-error"
        error_info["fixable"] = True
    
    return error_info

# Quick check of common error locations (limit scope to prevent hanging)
try:
    # Check only the most likely error file
    error_file = '/tmp/vite-errors.json'
    if os.path.exists(error_file):
        with open(error_file, 'r') as f:
            data = json.load(f)
            for error in data.get('errors', [])[:5]:  # Limit to 5 errors
                parsed_error = parse_simple_error(error.get('message', ''))
                parsed_error.update(error)
                errors.append(parsed_error)
except:
    pass

# Quick scan of development console log only
try:
    console_log = '/tmp/vite-console.log'
    if os.path.exists(console_log):
        with open(console_log, 'r') as f:
            # Read only last 2KB to avoid large file issues
            f.seek(0, 2)  # Go to end
            file_size = f.tell()
            if file_size > 2048:
                f.seek(file_size - 2048)
            else:
                f.seek(0)
            
            content = f.read()
            lines = content.split('\\n')[-20:]  # Only last 20 lines
            
            for line in lines:
                if any(pattern in line.lower() for pattern in ['error', 'failed', 'cannot']):
                    parsed_error = parse_simple_error(line)
                    if parsed_error["message"] and not any(e.get('message') == parsed_error['message'] for e in errors):
                        errors.append(parsed_error)
except:
    pass

# Deduplicate and limit results
unique_errors = []
seen_messages = set()
for error in errors[:10]:  # Limit to 10 errors max
    message = error.get('message', '')[:100]
    if message not in seen_messages:
        seen_messages.add(message)
        unique_errors.append(error)

print(json.dumps({"errors": unique_errors, "total_count": len(unique_errors)}))
    `, { timeout: 8000 }); // Reduced timeout to 8 seconds
    
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