/*
 * AI-Generated Fix
 * ================
 * Add a null/undefined check before calling the method on 'obj'. Either initialize 'obj' with a valid object or handle the undefined case gracefully (e.g., return early or throw a more descriptive error). Example fix: `if (!obj) { throw new Error('Object is undefined'); }` or `const obj = { doSomething: () => {} };`
 */
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ok')
  getOk() {
    console.log('this is ok');
    return { status: 'fine' };
  }

  @Get('error')
  getError() {
    console.log('error');
    throw new Error('Something went wrong!');
  }

  @Get('type-error')
  getTypeError() {
    const obj: any = undefined;
    obj.doSomething();
  }

  @Get('crash')
  getCrash() {
    process.nextTick(() => {
      throw new Error('Async crash');
    });
    return { ok: true, message: 'Crash scheduled' };
  }
}
