export declare class RegisterDto {
    email?: string;
    phone?: string;
    verificationChannel?: 'email' | 'phone';
    password: string;
    fullName?: string;
    lastName?: string;
    firstName?: string;
    middleName?: string;
    company: string;
}
