export interface OsztalyCsoportRef {
    Uid: string;
    Nev: string;
}

export interface TantargyRef {
    Uid: string;
    Nev: string;
    Kategoria?: {
        Uid: string;
        Nev: string;
        Leiras?: string;
    };
    SortIndex?: number;
}

export interface TanarProfil {
    Uid: string;
    Nev: string;
    EmailCim?: string;
    Telefonszam?: string;
    IntezmenyAzonosito?: string;
    IntezmenyNev?: string;
    OsztalyFonokOsztalyok?: OsztalyCsoportRef[];
    Tantargyak?: TantargyRef[];
    Id?: number | string;
    Kep?: any;
}
