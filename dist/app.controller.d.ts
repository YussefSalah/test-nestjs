import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    getOk(): {
        status: string;
    };
    getError(): void;
    getTypeError(): void;
    getCrash(): {
        ok: boolean;
        message: string;
    };
}
