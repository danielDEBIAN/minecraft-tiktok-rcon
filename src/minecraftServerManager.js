import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const DEFAULT_SERVER_DIR = process.env.MINECRAFT_SERVER_DIR || path.join(os.homedir(), 'minecraft-server');
const DEFAULT_JAVA_BIN = fs.existsSync('/home/linuxbrew/.linuxbrew/bin/java')
  ? '/home/linuxbrew/.linuxbrew/bin/java'
  : 'java';

export class MinecraftServerManager {
  constructor(options = {}) {
    this.serverDir = options.serverDir || DEFAULT_SERVER_DIR;
    this.javaBin = options.javaBin || DEFAULT_JAVA_BIN;
    this.minRamGb = Number(options.minRamGb) || 2;
    this.maxRamGb = Number(options.maxRamGb) || 4;
    this.child = null;
    this.state = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping'
    this.logs = [];
    this.maxLogLines = 300;
  }

  appendLog(text) {
    const lines = String(text)
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    const timestamp = new Date().toLocaleTimeString('es-MX', { hour12: false });
    for (const line of lines) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
      this.logs.push(`[${timestamp}] ${clean}`);
    }
    if (this.logs.length > this.maxLogLines) {
      this.logs = this.logs.slice(-this.maxLogLines);
    }
  }

  /**
   * Detecta el archivo JAR del servidor de Minecraft dentro de this.serverDir
   * (server.jar, paper-*.jar, purpur-*.jar, spigot-*.jar, fabric-server-*.jar, etc.)
   */
  detectServerJar() {
    try {
      if (!fs.existsSync(this.serverDir)) return null;
      const exactServer = path.join(this.serverDir, 'server.jar');
      if (fs.existsSync(exactServer)) return 'server.jar';

      const files = fs.readdirSync(this.serverDir).filter((f) => f.toLowerCase().endsWith('.jar'));
      const preferred = files.find((f) =>
        /^(paper|purpur|spigot|fabric-server|minecraft_server|forge|neoforge|server)/i.test(f)
      );
      return preferred || files[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Lee y parsea un archivo .properties clave=valor
   */
  readPropertiesFile(filePath) {
    const props = {};
    if (!fs.existsSync(filePath)) return props;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        props[key] = val;
      }
    } catch {
      // Ignorar
    }
    return props;
  }

  /**
   * Actualiza claves dentro de server.properties conservando comentarios y formato
   */
  updatePropertiesFile(filePath, updates) {
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
    } else {
      content = '# Minecraft server properties\n';
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${value}\n`;
      }
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Detecta si hay un proceso de servidor de Minecraft corriendo en el sistema
   */
  findRunningPid() {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child.pid;
    }
    try {
      const jarName = this.detectServerJar() || 'server.jar';
      const out = execSync(`pgrep -f "${jarName}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const firstPid = out.split('\n')[0]?.trim();
      return firstPid ? Number(firstPid) : null;
    } catch {
      return null;
    }
  }

  getStatus() {
    const pid = this.findRunningPid();
    if (!pid && (this.state === 'running' || this.state === 'starting' || this.state === 'stopping')) {
      this.state = 'stopped';
    } else if (pid && this.state === 'stopped') {
      this.state = 'running';
    }

    const jarName = this.detectServerJar();
    const eulaPath = path.join(this.serverDir, 'eula.txt');
    const propsPath = path.join(this.serverDir, 'server.properties');
    const props = this.readPropertiesFile(propsPath);

    let eulaAccepted = false;
    if (fs.existsSync(eulaPath)) {
      try {
        eulaAccepted = /^eula\s*=\s*true/im.test(fs.readFileSync(eulaPath, 'utf-8'));
      } catch {
        eulaAccepted = false;
      }
    }

    const rconEnabled =
      String(props['enable-rcon']).toLowerCase() === 'true' &&
      Boolean(props['rcon.password'] && props['rcon.password'].trim());

    return {
      state: this.state,
      pid,
      serverDir: this.serverDir,
      minRamGb: this.minRamGb,
      maxRamGb: this.maxRamGb,
      jarName: jarName || 'server.jar',
      jarExists: Boolean(jarName),
      eulaAccepted,
      rconEnabled,
      rconPort: Number(props['rcon.port']) || 25575,
      serverPort: Number(props['server-port']) || 25565,
      logsCount: this.logs.length,
    };
  }

  /**
   * Cambia la carpeta del servidor de Minecraft
   */
  setServerDir(newDir) {
    const resolved = path.resolve(String(newDir || '').trim());
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: `La carpeta "${resolved}" no existe.` };
    }
    this.serverDir = resolved;
    process.env.MINECRAFT_SERVER_DIR = resolved;
    return {
      ok: true,
      serverDir: this.serverDir,
      status: this.getStatus(),
    };
  }

  /**
   * Abre un selector gráfico nativo de carpetas (Electron, Windows PowerShell, Zenity o KDialog)
   */
  async pickServerFolderDialog() {
    if (typeof globalThis.__electronSelectFolder === 'function') {
      const selected = await globalThis.__electronSelectFolder(this.serverDir);
      if (selected) return this.setServerDir(selected);
      return { ok: false, cancelled: true };
    }
    try {
      if (process.platform === 'win32') {
        const psCmd =
          'Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "Selecciona la carpeta de tu Servidor de Minecraft"; if ($f.ShowDialog() -eq "OK") { Write-Output $f.SelectedPath }';
        const out = execSync(`powershell -NoProfile -Command "${psCmd}"`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (out) return this.setServerDir(out);
        return { ok: false, cancelled: true };
      }

      const out = execSync(
        `zenity --file-selection --directory --title="Selecciona la carpeta de tu Servidor de Minecraft" --filename="${this.serverDir}/" 2>/dev/null || kdialog --getexistingdirectory "${this.serverDir}" 2>/dev/null`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      if (out) {
        return this.setServerDir(out);
      }
      return { ok: false, cancelled: true };
    } catch {
      return { ok: false, cancelled: true };
    }
  }

  /**
   * Activa automáticamente eula=true en eula.txt y configura RCON nativo en server.properties (1 Clic)
   */
  configureRconAndEula(defaultPassword = 'minecraft_rcon_local') {
    if (!fs.existsSync(this.serverDir)) {
      try {
        fs.mkdirSync(this.serverDir, { recursive: true });
      } catch (err) {
        return { ok: false, error: `No se pudo acceder o crear la carpeta (${this.serverDir}): ${err.message}` };
      }
    }

    const eulaPath = path.join(this.serverDir, 'eula.txt');
    fs.writeFileSync(
      eulaPath,
      '# By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n',
      'utf-8'
    );

    const propsPath = path.join(this.serverDir, 'server.properties');
    const currentProps = this.readPropertiesFile(propsPath);
    const password = currentProps['rcon.password']?.trim() || process.env.RCON_PASSWORD || defaultPassword;
    const port = currentProps['rcon.port']?.trim() || process.env.RCON_PORT || '25575';

    this.updatePropertiesFile(propsPath, {
      'enable-rcon': 'true',
      'rcon.port': String(port),
      'rcon.password': password,
      'broadcast-rcon-to-ops': 'false',
    });

    this.appendLog(`✅ EULA aceptado (eula.txt) y RCON nativo activado en server.properties (Puerto ${port})`);

    return {
      ok: true,
      rconPort: Number(port),
      rconPassword: password,
      message: `EULA aceptado y RCON nativo habilitado en server.properties (Puerto ${port})`,
      status: this.getStatus(),
    };
  }

  getLogs() {
    return this.logs;
  }

  /**
   * Inicia el servidor dedicado de Minecraft en segundo plano sin necesidad de abrir una terminal
   */
  start({ minRamGb, maxRamGb } = {}) {
    if (minRamGb) this.minRamGb = Math.max(1, Math.min(Number(minRamGb) || 2, 32));
    if (maxRamGb) this.maxRamGb = Math.max(this.minRamGb, Math.min(Number(maxRamGb) || 4, 64));

    const existingPid = this.findRunningPid();
    if (existingPid) {
      return {
        ok: true,
        alreadyRunning: true,
        pid: existingPid,
        message: `El servidor de Minecraft ya está en ejecución (PID: ${existingPid}).`,
      };
    }

    const jarName = this.detectServerJar();
    if (!jarName) {
      return {
        ok: false,
        error: `No se encontró ningún archivo de servidor (server.jar, paper.jar, etc.) en ${this.serverDir}`,
      };
    }

    // Asegurar automáticamente que eula=true y enable-rcon=true estén listos antes de arrancar
    this.configureRconAndEula();

    const args = [`-Xms${this.minRamGb}G`, `-Xmx${this.maxRamGb}G`, '-jar', jarName, 'nogui'];

    this.state = 'starting';
    this.appendLog(`🚀 Iniciando servidor de Minecraft: ${this.javaBin} ${args.join(' ')}`);

    this.child = spawn(this.javaBin, args, {
      cwd: this.serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      this.appendLog(text);
      if (text.includes('RCON running on') || text.includes('Done (') || text.includes('For help, type "help"')) {
        this.state = 'running';
      }
    });

    this.child.stderr.on('data', (chunk) => {
      this.appendLog(chunk.toString());
    });

    this.child.on('exit', (code, signal) => {
      this.appendLog(`⏹️ Servidor de Minecraft detenido (código: ${code ?? 'N/A'}, señal: ${signal ?? 'N/A'}).`);
      this.child = null;
      this.state = 'stopped';
    });

    this.child.on('error', (err) => {
      this.appendLog(`❌ Error al iniciar ${jarName}: ${err.message}`);
      this.state = 'stopped';
    });

    return {
      ok: true,
      pid: this.child.pid,
      message: `Iniciando servidor de Minecraft (${jarName}, PID: ${this.child.pid}, RAM: ${this.minRamGb}G-${this.maxRamGb}G)...`,
    };
  }

  /**
   * Detiene el servidor de Minecraft de forma segura (guardando el mundo con `stop`)
   */
  async stop() {
    const pid = this.findRunningPid();
    if (!pid) {
      this.state = 'stopped';
      return { ok: true, message: 'El servidor de Minecraft ya estaba apagado.' };
    }

    this.state = 'stopping';
    this.appendLog('🛑 Enviando señal de apagado seguro (stop) al servidor de Minecraft...');

    if (this.child && this.child.stdin && !this.child.killed) {
      try {
        this.child.stdin.write('stop\n');
      } catch {
        // Ignorar
      }
      setTimeout(() => {
        if (this.child && !this.child.killed && this.child.exitCode === null) {
          this.child.kill('SIGTERM');
        }
      }, 10000);
    } else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (err) {
        return { ok: false, error: `No se pudo detener el proceso ${pid}: ${err.message}` };
      }
    }

    return {
      ok: true,
      message: 'Deteniendo el servidor de Minecraft y guardando el mundo...',
    };
  }

  /**
   * Envía un comando directo a la consola del proceso de Minecraft
   */
  sendConsoleCommand(cmd) {
    const clean = String(cmd || '').trim().replace(/^\//, '');
    if (!clean) return { ok: false, error: 'Comando vacío' };

    if (this.child && this.child.stdin && !this.child.killed) {
      this.appendLog(`> ${clean}`);
      this.child.stdin.write(`${clean}\n`);
      return { ok: true, message: `Comando enviado a consola: ${clean}` };
    }
    return {
      ok: false,
      error: 'El servidor no fue iniciado desde esta sesión web (usa RCON o inícialo desde el panel).',
    };
  }

  /**
   * Lee la configuración del servidor (`server.properties`) y memoria RAM
   */
  readServerConfigs() {
    const propsPath = path.join(this.serverDir, 'server.properties');
    const props = this.readPropertiesFile(propsPath);

    const toBool = (val, defaultVal = true) => {
      if (val === undefined) return defaultVal;
      return String(val).toLowerCase() === 'true';
    };

    const serverConfig = {
      ServerName: props['server-name'] || 'Minecraft Server',
      MOTD: props['motd'] || '§a¡Servidor de Minecraft §f× §dTikTok Live!',
      ServerPort: Number(props['server-port']) || 25565,
      GameMode: props['gamemode'] || 'survival',
      Difficulty: props['difficulty'] || 'normal',
      MaxPlayers: Number(props['max-players']) || 20,
      MaxViewRadius: Number(props['view-distance']) || 10,
      WhiteList: toBool(props['white-list'], false),
    };

    const worldConfig = {
      IsPvpEnabled: toBool(props['pvp'], true),
      OnlineMode: toBool(props['online-mode'], true),
      SpawnMonsters: toBool(props['spawn-monsters'], true),
      SpawnAnimals: toBool(props['spawn-animals'], true),
      AllowFlight: toBool(props['allow-flight'], true),
      EnableCommandBlock: toBool(props['enable-command-block'], true),
      Hardcore: toBool(props['hardcore'], false),
    };

    return {
      serverConfig,
      worldConfig,
      ram: {
        minRamGb: this.minRamGb,
        maxRamGb: this.maxRamGb,
      },
    };
  }

  /**
   * Guarda los cambios en `server.properties` y RAM
   */
  saveServerConfigs({ serverUpdates = {}, worldUpdates = {}, ramUpdates = {} }) {
    const propsPath = path.join(this.serverDir, 'server.properties');

    if (ramUpdates.minRamGb) {
      this.minRamGb = Math.max(1, Math.min(Number(ramUpdates.minRamGb) || 2, 32));
    }
    if (ramUpdates.maxRamGb) {
      this.maxRamGb = Math.max(this.minRamGb, Math.min(Number(ramUpdates.maxRamGb) || 4, 64));
    }

    const updates = {};

    if (typeof serverUpdates.ServerName === 'string') updates['server-name'] = serverUpdates.ServerName;
    if (typeof serverUpdates.MOTD === 'string') updates['motd'] = serverUpdates.MOTD;
    if (serverUpdates.ServerPort !== undefined) {
      updates['server-port'] = String(Math.max(1024, Math.min(Number(serverUpdates.ServerPort) || 25565, 65535)));
    }
    if (typeof serverUpdates.GameMode === 'string') updates['gamemode'] = serverUpdates.GameMode;
    if (typeof serverUpdates.Difficulty === 'string') updates['difficulty'] = serverUpdates.Difficulty;
    if (serverUpdates.MaxPlayers !== undefined) {
      updates['max-players'] = String(Math.max(1, Math.min(Number(serverUpdates.MaxPlayers) || 20, 1000)));
    }
    if (serverUpdates.MaxViewRadius !== undefined) {
      updates['view-distance'] = String(Math.max(3, Math.min(Number(serverUpdates.MaxViewRadius) || 10, 32)));
    }
    if (typeof serverUpdates.WhiteList === 'boolean') {
      updates['white-list'] = String(serverUpdates.WhiteList);
    }

    if (typeof worldUpdates.IsPvpEnabled === 'boolean') updates['pvp'] = String(worldUpdates.IsPvpEnabled);
    if (typeof worldUpdates.OnlineMode === 'boolean') updates['online-mode'] = String(worldUpdates.OnlineMode);
    if (typeof worldUpdates.SpawnMonsters === 'boolean') updates['spawn-monsters'] = String(worldUpdates.SpawnMonsters);
    if (typeof worldUpdates.SpawnAnimals === 'boolean') updates['spawn-animals'] = String(worldUpdates.SpawnAnimals);
    if (typeof worldUpdates.AllowFlight === 'boolean') updates['allow-flight'] = String(worldUpdates.AllowFlight);
    if (typeof worldUpdates.EnableCommandBlock === 'boolean') {
      updates['enable-command-block'] = String(worldUpdates.EnableCommandBlock);
    }
    if (typeof worldUpdates.Hardcore === 'boolean') updates['hardcore'] = String(worldUpdates.Hardcore);

    if (Object.keys(updates).length > 0 && fs.existsSync(this.serverDir)) {
      this.updatePropertiesFile(propsPath, updates);
    }

    return this.readServerConfigs();
  }
}

