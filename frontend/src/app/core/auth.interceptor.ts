import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Si la API responde 401 (sesión caducada o cerrada), la app vuelve a "Entrar" (feature 004). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/')) {
        auth.loggedOut();
      }
      return throwError(() => err);
    }),
  );
};
