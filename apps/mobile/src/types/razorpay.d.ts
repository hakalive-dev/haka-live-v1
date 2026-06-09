declare module 'react-native-razorpay' {
  export type RazorpayOptions = {
    key: string;
    amount: number | string;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    order_id?: string;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    notes?: { [key: string]: string };
    theme?: { color?: string; hide_topbar?: boolean };
    modal?: {
      backdropclose?: boolean;
      escape?: boolean;
      handleback?: boolean;
      confirm_close?: boolean;
      ondismiss?: () => void;
      animation?: boolean;
    };
    [key: string]: any;
  };

  export type PaymentSuccessData = {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
    [key: string]: any;
  };

  export type PaymentErrorData = {
    code: number;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata: { order_id?: string; payment_id?: string; [key: string]: any };
  };

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<PaymentSuccessData>;
  };

  export default RazorpayCheckout;
}
