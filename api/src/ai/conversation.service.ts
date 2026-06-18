import { normalize } from "../files/search.service.js";

export type AssistantMemory = {
  memory_type: string;
  content: string;
};

export type ConversationContext = {
  assistantName?: string;
  memories?: AssistantMemory[];
  now?: Date;
};

export type AssistantReply = {
  reply: string;
  memoryWrite?: {
    memoryType: string;
    content: string;
  };
};

export function buildAssistantReply(rawText: string, context: ConversationContext = {}): AssistantReply {
  const assistantName = context.assistantName?.trim() || "Jarvis";
  const normalized = normalize(rawText);
  const now = context.now ?? new Date();
  const learned = extractLearning(rawText, normalized);

  if (learned) {
    return {
      reply: `Aprendido. Vou lembrar que ${learned}.`,
      memoryWrite: { memoryType: "user_fact", content: learned }
    };
  }

  if (/\b(oi|ola|e ai|bom dia|boa tarde|boa noite)\b/.test(normalized)) {
    return { reply: `Ola. ${assistantName} online. Posso conversar, raciocinar e so agir nos aparelhos quando voce pedir claramente.` };
  }

  if (/\b(obrigado|obrigada|valeu)\b/.test(normalized)) {
    return { reply: "Fechado. Estou por aqui." };
  }

  if (/\b(que horas|hora atual|horario)\b/.test(normalized)) {
    return { reply: `Agora sao ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` };
  }

  if (/\b(que dia|data de hoje|data atual)\b/.test(normalized)) {
    return { reply: `Hoje e ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.` };
  }

  const math = solveArithmeticQuestion(rawText);
  if (math) {
    return { reply: math };
  }

  if (/\b(o que voce sabe sobre mim|minhas memorias|o que aprendeu)\b/.test(normalized)) {
    const memories = (context.memories ?? []).slice(0, 5);
    if (memories.length === 0) {
      return { reply: "Ainda nao tenho memorias aprovadas sobre voce. Se quiser, diga: aprenda que..." };
    }
    return { reply: `Tenho estas memorias principais: ${memories.map((memory) => memory.content).join("; ")}.` };
  }

  if (/\b(quem e voce|quem voce e|o que voce faz|o que faz)\b/.test(normalized)) {
    return {
      reply: `Sou o ${assistantName}, um assistente local do seu ecossistema Jarvis. Converso primeiro, classifico intencoes e so preparo acoes em arquivos ou apps quando o pedido for explicito.`
    };
  }

  if (/\b(ia propria|inteligencia propria|aprendizado de maquina|machine learning|modelo local|sem depender)\b/.test(normalized)) {
    return {
      reply: "Podemos seguir por camadas: primeiro memoria e raciocinio local rapido; depois um modelo local opcional; por fim treino fino com dados aprovados. Assim o Jarvis fica mais independente sem travar o produto agora."
    };
  }

  if (isQuestion(normalized)) {
    return { reply: answerQuestionLocally(rawText, normalized, context.memories ?? []) };
  }

  return {
    reply: "Entendi. Vou tratar isso como conversa por enquanto. Se quiser uma acao real em arquivo, app ou dispositivo, peca explicitamente e eu preparo com confirmacao."
  };
}

function extractLearning(rawText: string, normalized: string) {
  if (!/\b(aprenda|memorize|lembre)\b/.test(normalized)) {
    return null;
  }

  return rawText
    .replace(/^.*?\b(aprenda|memorize|lembre)(-se)?\b\s*(que)?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400) || null;
}

function isQuestion(normalized: string) {
  return /\b(o que|quem|qual|quais|quando|onde|como|por que|porque|explique|resuma|me diga|me conte|posso|podemos)\b/.test(normalized);
}

function answerQuestionLocally(rawText: string, normalized: string, memories: AssistantMemory[]) {
  const subject = rawText.replace(/[?!.]+$/g, "").trim();
  const memoryHint = memories[0]?.content ? ` Vou considerar tambem o que ja aprendi: ${memories[0].content}.` : "";

  if (/\b(tempo real|noticia|cotacao|preco|clima|hoje)\b/.test(normalized)) {
    return `Posso raciocinar sobre isso, mas dados em tempo real precisam de uma fonte conectada. Em modo local, eu analisaria "${subject}" separando contexto, restricoes e proximo passo seguro.${memoryHint}`;
  }

  if (/\b(como|explique|o que|por que|porque)\b/.test(normalized)) {
    return `Resposta rapida: eu dividiria "${subject}" em objetivo, contexto e acao recomendada. Me diga o nivel de detalhe que voce quer e eu aprofundo sem acionar nenhum dispositivo.${memoryHint}`;
  }

  return `Boa pergunta. Em modo local, minha melhor resposta e organizar o raciocinio sobre "${subject}" e pedir contexto quando faltar dado confiavel.${memoryHint}`;
}

function solveArithmeticQuestion(rawText: string) {
  const expression = rawText
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(quanto e|calcule|calcular|resolva|resolve|resultado de|qual o resultado de)\b/g, " ")
    .replace(/[?=]/g, " ")
    .replace(/,/g, ".")
    .trim();

  if (!/[0-9]/.test(expression) || !/^[0-9+\-*/().\s]+$/.test(expression) || expression.length > 80) {
    return null;
  }

  const result = calculate(expression);
  if (result === null) {
    return null;
  }

  return `O resultado e ${Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/0+$/g, "").replace(/\.$/, "")}.`;
}

function calculate(input: string) {
  const tokens = input.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  let index = 0;

  function parseExpression(): number | null {
    let value = parseTerm();
    if (value === null) return null;
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const next = parseTerm();
      if (next === null) return null;
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  }

  function parseTerm(): number | null {
    let value = parseFactor();
    if (value === null) return null;
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const next = parseFactor();
      if (next === null || (operator === "/" && next === 0)) return null;
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  }

  function parseFactor(): number | null {
    const token = tokens[index++];
    if (!token) return null;
    if (token === "-") {
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (token === "(") {
      const value = parseExpression();
      if (tokens[index++] !== ")") return null;
      return value;
    }
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  }

  const value = parseExpression();
  return value !== null && index === tokens.length && Number.isFinite(value) ? value : null;
}
