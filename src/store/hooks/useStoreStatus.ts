import { useState, useEffect } from 'react';

export function useStoreStatus() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      const now = new Date();
      // Pega a data e hora exata no fuso horário do MS (Mato Grosso do Sul)
      const msTimeString = now.toLocaleString('en-US', { timeZone: 'America/Campo_Grande' });
      const msTime = new Date(msTimeString);
      
      const day = msTime.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
      const hours = msTime.getHours();
      const minutes = msTime.getMinutes();
      
      const timeInMinutes = hours * 60 + minutes;
      
      let open = false;

      if (day >= 1 && day <= 5) {
        // Segunda a Sexta: 07:30 às 11:00 e 13:00 às 17:30
        const morningOpen = timeInMinutes >= (7 * 60 + 30) && timeInMinutes < (11 * 60);
        const afternoonOpen = timeInMinutes >= (13 * 60) && timeInMinutes < (17 * 60 + 30);
        open = morningOpen || afternoonOpen;
      } else if (day === 6) {
        // Sábado: 08:00 às 12:00
        open = timeInMinutes >= (8 * 60) && timeInMinutes < (12 * 60);
      }

      setIsOpen(open);
    };

    // Checa imediatamente
    checkStatus();

    // Atualiza a cada 1 minuto para virar "aberto/fechado" automaticamente se o usuário ficar com a página aberta
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return isOpen;
}
