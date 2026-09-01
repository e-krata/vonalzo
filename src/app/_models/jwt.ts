export interface Jwt {
    iat?: number;
    exp?: number;
    name: string;
    role: string | string[];
    "kreta:user_name"?: string;
    "kreta:institute_code"?: string;
    "kreta:institute_user_id"?: string | number;
    sub?: string;
    [key: string]: any;
}
