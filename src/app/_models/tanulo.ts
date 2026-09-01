/** Diák a ujkreta API válaszából (Uid alapú). */
export interface ApiTanulo {
    Uid: string;
    Nev: string;
    OsztalyCsoport?: {
        Uid: string;
        Nev: string;
    };
    EmailCim?: string;
}