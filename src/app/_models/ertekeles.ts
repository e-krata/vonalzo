export interface Ertekeles {
    Uid?: string;
    TantargyUid?: string;
    Tema?: string;
    SzamErtek?: number;
    SzovegesErtek?: string;
    SulySzazalekErteke?: number;
    Tipus?: {
        Uid: string;
        Nev: string;
        Leiras?: string;
    };
    OsztalyCsoportUid?: string;
    TanuloUid?: string;
    Datum?: string;
    [key: string]: any;
}
