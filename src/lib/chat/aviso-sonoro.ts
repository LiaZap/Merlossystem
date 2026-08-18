/**
 * Aviso de mensagem nova: um bipe curto e, quando a aba esta escondida, uma
 * notificacao do sistema.
 *
 * Por que Web Audio e nao um arquivo .mp3: o bipe e sintetizado em duas
 * dezenas de linhas, entao nao ha asset para servir, nem 404 silencioso em
 * producao, nem espera de rede no momento em que o som precisa tocar.
 *
 * Por que "armar" no primeiro gesto: o navegador bloqueia audio antes de
 * qualquer interacao do usuario (politica de autoplay). Um `new AudioContext()`
 * criado no carregamento da pagina nasce suspenso, e a primeira mensagem que
 * chegar nao toca nada — sem erro no console. Criamos o contexto no primeiro
 * clique/tecla, quando o navegador permite.
 */

let contexto: AudioContext | null = null
let armado = false

type ContextoDeAudio = typeof AudioContext

function construtorDeAudio(): ContextoDeAudio | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    AudioContext?: ContextoDeAudio
    webkitAudioContext?: ContextoDeAudio
  }
  return w.AudioContext || w.webkitAudioContext || null
}

/**
 * Prepara o audio no primeiro gesto do usuario. Idempotente: chamar de novo
 * nao cria um segundo contexto (o navegador limita quantos existem por aba).
 *
 * Devolve a funcao de limpeza para o `useEffect`.
 */
export function armarAviso(): () => void {
  if (typeof window === "undefined") return () => {}

  function aoPrimeiroGesto() {
    if (armado) return
    const Construtor = construtorDeAudio()
    if (!Construtor) return
    try {
      contexto = new Construtor()
      armado = true
    } catch {
      // Aba sem permissao de audio: o resto do chat continua funcionando.
      armado = false
    }
  }

  window.addEventListener("pointerdown", aoPrimeiroGesto, { once: true })
  window.addEventListener("keydown", aoPrimeiroGesto, { once: true })

  return () => {
    window.removeEventListener("pointerdown", aoPrimeiroGesto)
    window.removeEventListener("keydown", aoPrimeiroGesto)
  }
}

/** Bipe curto de duas notas. Silencioso se o audio nao foi armado. */
export function tocarBipe() {
  if (!contexto) return
  // O contexto pode ter sido suspenso pelo navegador ao esconder a aba.
  if (contexto.state === "suspended") void contexto.resume()

  const agora = contexto.currentTime
  const ganho = contexto.createGain()
  ganho.connect(contexto.destination)
  // Volume baixo de proposito: quem atende passa o dia com isso no ouvido.
  ganho.gain.setValueAtTime(0.0001, agora)
  ganho.gain.exponentialRampToValueAtTime(0.08, agora + 0.01)
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.28)

  for (const [frequencia, atraso] of [
    [880, 0],
    [1174, 0.09],
  ] as const) {
    const oscilador = contexto.createOscillator()
    oscilador.type = "sine"
    oscilador.frequency.value = frequencia
    oscilador.connect(ganho)
    oscilador.start(agora + atraso)
    oscilador.stop(agora + atraso + 0.18)
  }
}

/**
 * Notificacao do sistema, so quando a aba esta escondida — notificar quem esta
 * olhando a tela e ruido.
 *
 * Nao pedimos permissao aqui: pedir sem o usuario ter agido gera um popup do
 * nada e o navegador penaliza. Quem quiser ativa em `pedirPermissaoDeAviso`,
 * a partir de um clique.
 */
export function notificarSeEscondido(titulo: string, corpo: string) {
  if (typeof document === "undefined" || document.visibilityState === "visible") return
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return
  try {
    // `tag` fixa por conversa faz a notificacao nova SUBSTITUIR a anterior em
    // vez de empilhar uma por mensagem quando chega uma rajada.
    new Notification(titulo, { body: corpo, tag: `merlos:${titulo}` })
  } catch {
    // Alguns navegadores exigem service worker para notificar. Sem drama.
  }
}

/** Pede permissao de notificacao. Chamar SEMPRE a partir de um clique. */
export async function pedirPermissaoDeAviso(): Promise<boolean> {
  if (typeof Notification === "undefined") return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  return (await Notification.requestPermission()) === "granted"
}
