export interface ConsoleNote {
    page: string;
    type: string;
    text: string;
}

export interface AcceptedNote {
    page: string;
    match: string;
    reason: string;
}

export interface Classified {
    accepted: { note: ConsoleNote; reason: string }[];
    unexplained: ConsoleNote[];
}

const matches = (accepted: AcceptedNote, note: ConsoleNote): boolean =>
    (accepted.page === "*" || accepted.page === note.page) && note.text.includes(accepted.match);

export const classifyConsole = (notes: ConsoleNote[], accepted: AcceptedNote[]): Classified => {
    const result: Classified = { accepted: [], unexplained: [] };
    for (const note of notes) {
        const rule = accepted.find((candidate) => matches(candidate, note));
        if (rule) {
            result.accepted.push({ note, reason: rule.reason });
        } else {
            result.unexplained.push(note);
        }
    }
    return result;
};

export const unusedAcceptances = (notes: ConsoleNote[], accepted: AcceptedNote[]): AcceptedNote[] =>
    accepted.filter((rule) => !notes.some((note) => matches(rule, note)));
