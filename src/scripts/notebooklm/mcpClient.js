import { spawn } from 'child_process';

const SERVER_PATH = 'C:\\Users\\javie\\AppData\\Roaming\\npm\\node_modules\\notebooklm-mcp\\dist\\index.js';

/**
 * Executes a tool on the NotebookLM MCP server over stdio.
 * 
 * @param {string} toolName - Tool to invoke (e.g. 'get_health', 'setup_auth', 'ask_question', 'add_notebook')
 * @param {object} toolArgs - Tool arguments
 * @param {number} timeoutMs - Max execution time before timing out
 * @returns {Promise<any>}
 */
export function callNotebooklmMcp(toolName, toolArgs = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.kill();
        reject(new Error(`Timeout tras ${timeoutMs / 1000}s ejecutando la herramienta MCP '${toolName}'`));
      }
    }, timeoutMs);

    server.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Retener contenido incompleto

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) {
            // Handshake completado -> enviar notification initialized y ejecutar tool
            server.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
              params: {}
            }) + '\n');

            server.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: toolArgs
              }
            }) + '\n');
          } else if (msg.id === 2) {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              server.kill();
              if (msg.error) {
                reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              } else {
                let parsedResult = msg.result;
                // Si el MCP devolvió texto JSON en content[0].text, parsearlo para mayor comodidad
                if (msg.result?.content?.[0]?.text) {
                  try {
                    parsedResult = JSON.parse(msg.result.content[0].text);
                  } catch {
                    parsedResult = msg.result.content[0].text;
                  }
                }
                resolve(parsedResult);
              }
            }
          }
        } catch {
          // Ignorar fragmentos que no sean JSON válido
        }
      }
    });

    server.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    // Iniciar el apretón de manos MCP
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'proyectosueldos-notebooklm-client', version: '1.0.0' }
      }
    }) + '\n');
  });
}
