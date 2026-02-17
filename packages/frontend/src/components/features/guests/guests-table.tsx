'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Tag, MoreVertical, Trash2, Eye, Edit } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteGuest, type Guest } from '@/lib/hooks/use-guests';
import { toast } from 'sonner';

interface GuestsTableProps {
  guests: Guest[];
  onEdit: (guest: Guest) => void;
}

export function GuestsTable({ guests, onEdit }: GuestsTableProps) {
  const router = useRouter();
  const deleteGuest = useDeleteGuest();
  const { confirmDialog, confirm } = useConfirmDialog();

  const handleDelete = async (guest: Guest) => {
    const confirmed = await confirm({
      title: 'Delete Guest?',
      description: `Are you sure you want to delete ${guest.name}? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (confirmed) {
      try {
        await deleteGuest.mutateAsync(guest.id);
        toast.success('Guest deleted successfully');
      } catch {
        toast.error('Failed to delete guest');
      }
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No guests found
                </TableCell>
              </TableRow>
            ) : (
              guests.map((guest) => (
                <TableRow
                  key={guest.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/guests/${guest.id}`)}
                >
                  <TableCell className="font-medium">{guest.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {guest.email && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{guest.email}</span>
                        </div>
                      )}
                      {guest.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{guest.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{guest.language.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    {guest.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {guest.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            <Tag className="mr-1 h-3 w-3" />
                            {tag}
                          </Badge>
                        ))}
                        {guest.tags.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{guest.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {guest.source ? (
                      <Badge variant="outline">{guest.source}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/guests/${guest.id}`} onClick={(e) => e.stopPropagation()}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(guest);
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(guest);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {confirmDialog}
    </>
  );
}
