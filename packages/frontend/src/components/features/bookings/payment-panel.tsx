'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PaymentStatusBadge } from './payment-status-badge';
import { useCreatePayment, useDeletePayment } from '@/lib/hooks/use-bookings';
import { formatCurrency, formatDate } from '@/lib/format';
import { toast } from 'sonner';

interface PaymentPanelProps {
  bookingId: string;
  payments: Array<{
    id: string;
    bookingId: string;
    amount: number;
    method: string;
    date: string;
    notes: string | null;
    deletedAt: string | null;
    createdAt: string;
  }>;
  paymentSummary: {
    totalPrice: number;
    totalPaid: number;
    balanceDue: number;
  };
}

const paymentFormSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(['bank_transfer', 'cash']),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
};

export function PaymentPanel({ bookingId, payments, paymentSummary }: PaymentPanelProps) {
  const createPayment = useCreatePayment(bookingId);
  const deletePayment = useDeletePayment(bookingId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const status = paymentSummary.totalPaid >= paymentSummary.totalPrice
    ? 'paid'
    : paymentSummary.totalPaid > 0
      ? 'partial'
      : 'unpaid';

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: undefined,
      method: 'bank_transfer',
      date: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  const onSubmit = async (data: PaymentFormValues) => {
    try {
      await createPayment.mutateAsync({
        amount: Math.round(data.amount * 100),
        method: data.method,
        date: data.date,
        notes: data.notes || null,
      });
      toast.success('Payment logged');
      form.reset({
        amount: undefined,
        method: 'bank_transfer',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log payment');
    }
  };

  const handleDelete = async (paymentId: string) => {
    setDeletingId(paymentId);
    try {
      await deletePayment.mutateAsync(paymentId);
      toast.success('Payment deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter out soft-deleted payments and sort by date descending
  const activePayments = payments
    .filter((p) => !p.deletedAt)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-6">
      {/* Balance Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Payment Balance</span>
            <PaymentStatusBadge status={status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold">{formatCurrency(paymentSummary.totalPrice)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Paid: </span>
              <span className="font-semibold text-green-700">{formatCurrency(paymentSummary.totalPaid)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Due: </span>
              <span className={`font-semibold ${paymentSummary.balanceDue > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(paymentSummary.balanceDue)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Payment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (EUR)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Payment reference, wire transfer ID, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="sm:col-span-2">
                <Button type="submit" disabled={createPayment.isPending}>
                  {createPayment.isPending ? 'Logging...' : 'Log Payment'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {activePayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-sm">{formatDate(payment.date)}</TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(payment.amount)}</TableCell>
                    <TableCell className="text-sm">{METHOD_LABELS[payment.method] ?? payment.method}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{payment.notes ?? '-'}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={deletingId === payment.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
                            <AlertDialogDescription>
                              Delete this payment of {formatCurrency(payment.amount)}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(payment.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
