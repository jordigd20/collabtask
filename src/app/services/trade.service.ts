import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Task, Team, TeamErrorCodes, Trade, User } from '../interfaces';
import { TeamService } from './team.service';
import { TaskService } from './task.service';
import {
  collabTaskErrors,
  convertStringToTimestamp,
  convertTimestampToString
} from '../helpers/common-functions';
import { ToastService } from './toast.service';
import { Observable, debounceTime, firstValueFrom, map, shareReplay } from 'rxjs';
import { TaskErrorCodes } from '../interfaces/errors/task-error-codes.enum';
import { TradeData } from '../interfaces/data/trade-data.interface';
import firebase from 'firebase/compat/app';
import { TradeErrorCodes } from '../interfaces/errors/trade-error-codes.enum';
@Injectable({
  providedIn: 'root'
})
export class TradeService {
  private tradesReceived$: Observable<Trade[]> | undefined;
  private tradesSent$: Observable<Trade[]> | undefined;
  private currentTradesReceivedIdUser: string = '';
  private currentTradesSentIdUser: string = '';

  constructor(
    private afs: AngularFirestore,
    private teamService: TeamService,
    private taskService: TaskService,
    private toastService: ToastService
  ) {}

  getTradesReceived(idUser: string) {
    if (!this.tradesReceived$ || this.currentTradesReceivedIdUser !== idUser) {
      this.tradesReceived$ = this.afs
        .collection<Trade>('trades', (ref) =>
          ref
            .where('userReceiver.id', '==', idUser)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
        )
        .valueChanges({ idField: 'id' })
        .pipe(
          debounceTime(350),
          map((trades) => {
            return trades.map((trade) => {
              const createdAt = trade.createdAt as firebase.firestore.Timestamp;
              return {
                ...trade,
                createdAt: convertTimestampToString(createdAt)
              };
            });
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        );

      this.currentTradesReceivedIdUser = idUser;
    }

    return this.tradesReceived$;
  }

  getTradesSent(idUser: string) {
    if (!this.tradesSent$ || this.currentTradesSentIdUser !== idUser) {
      this.tradesSent$ = this.afs
        .collection<Trade>('trades', (ref) =>
          ref.where('userSender.id', '==', idUser).orderBy('createdAt', 'desc')
        )
        .valueChanges({ idField: 'id' })
        .pipe(
          debounceTime(350),
          map((trades) => {
            return trades.map((trade) => {
              const createdAt = trade.createdAt as firebase.firestore.Timestamp;
              return {
                ...trade,
                createdAt: convertTimestampToString(createdAt)
              };
            });
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        );

      this.currentTradesSentIdUser = idUser;
    }

    return this.tradesSent$;
  }

  async createTrade({ idUserSender, idUserReceiver, ...tradeData }: TradeData) {
    try {
      const [team, taskOffered] = await Promise.all([
        firstValueFrom(this.teamService.getTeam(tradeData.idTeam)),
        firstValueFrom(this.taskService.getTaskObservable(tradeData.taskOffered))
      ]);

      let taskRequested: Task | undefined;

      if (tradeData.tradeType === 'task' && tradeData.idTaskRequested) {
        taskRequested = await firstValueFrom(
          this.taskService.getTaskObservable(tradeData.idTaskRequested)
        );
      }

      if (!team) {
        throw new Error(TeamErrorCodes.TeamNotFound);
      }

      if (!taskOffered || (tradeData.tradeType === 'task' && !taskRequested)) {
        throw new Error(TaskErrorCodes.TaskNotFound);
      }

      if (!team.taskLists[tradeData.idTaskList]) {
        throw new Error(TeamErrorCodes.TaskListNotFound);
      }

      if (!team.userMembers[idUserReceiver] || !team.userMembers[idUserSender]) {
        throw new Error(TeamErrorCodes.UserDoesNotBelongToTeam);
      }

      if (taskOffered.isInvolvedInTrade) {
        throw new Error(TradeErrorCodes.TaskOfferedIsAlreadyInvolvedInTrade);
      }

      if (
        tradeData.tradeType === 'score' &&
        team.taskLists[tradeData.idTaskList].userScore[idUserSender] < tradeData.scoreOffered
      ) {
        throw new Error(TradeErrorCodes.UserDoesNotHaveEnoughScore);
      }

      if (taskOffered.completed) {
        throw new Error(TradeErrorCodes.TaskOfferedIsAlreadyCompleted);
      }

      if (tradeData.tradeType === 'task' && taskRequested!.completed) {
        throw new Error(TradeErrorCodes.TaskRequestedIsAlreadyCompleted);
      }

      if (taskOffered.idUserAssigned !== idUserSender) {
        throw new Error(TradeErrorCodes.TaskRequestedAlreadyBelongsToAnotherUser);
      }

      if (tradeData.tradeType === 'task' && taskRequested!.idUserAssigned !== idUserReceiver) {
        throw new Error(TradeErrorCodes.TaskRequestedAlreadyBelongsToAnotherUser);
      }

      const userSender = {
        id: idUserSender,
        name: team.userMembers[idUserSender].name,
        photoURL: team.userMembers[idUserSender].photoURL
      };

      const userReceiver = {
        id: idUserReceiver,
        name: team.userMembers[idUserReceiver].name,
        photoURL: team.userMembers[idUserReceiver].photoURL
      };

      const createdAt = convertStringToTimestamp(new Date().toISOString());
      const id = this.afs.createId();
      const trade: Trade = {
        id,
        userSender,
        userReceiver,
        idUsersInvolved: [idUserSender, idUserReceiver],
        createdAt,
        status: 'pending',
        ...tradeData
      };

      const batch = this.afs.firestore.batch();
      const tradeRef = this.afs.doc<Trade>(`trades/${id}`).ref;
      batch.set(tradeRef, { ...trade, id });

      const taskOfferedRef = this.afs.doc<Task>(`tasks/${trade.taskOffered}`).ref;
      batch.update(taskOfferedRef, {
        isInvolvedInTrade: true,
        idTrade: id
      });

      await batch.commit();

      this.toastService.showToast({
        message: 'Se ha enviado la petición de intercambio',
        icon: 'checkmark-circle',
        cssClass: 'toast-success'
      });
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async acceptTrade(trade: Trade) {
    try {
      const { idTeam, idTaskList, idTaskRequested, userReceiver, userSender } = trade;
      const [team, taskOffered] = await Promise.all([
        firstValueFrom(this.teamService.getTeam(idTeam)),
        firstValueFrom(this.taskService.getTaskObservable(trade.taskOffered))
      ]);

      let taskRequested: Task | undefined;

      if (trade.tradeType === 'task' && trade.taskOffered) {
        taskRequested = await firstValueFrom(this.taskService.getTaskObservable(idTaskRequested));
      }

      if (!team) {
        throw new Error(TeamErrorCodes.TeamNotFound);
      }

      if (!taskOffered || (trade.tradeType === 'task' && !taskRequested)) {
        throw new Error(TaskErrorCodes.TaskNotFound);
      }

      if (!team.taskLists[idTaskList]) {
        throw new Error(TeamErrorCodes.TaskListNotFound);
      }

      if (!team.userMembers[userReceiver.id] || !team.userMembers[userSender.id]) {
        throw new Error(TeamErrorCodes.UserDoesNotBelongToTeam);
      }

      if (
        trade.tradeType === 'score' &&
        team.taskLists[trade.idTaskList].userScore[userSender.id] < trade.scoreOffered
      ) {
        await Promise.all([
          this.afs.doc<Trade>(`trades/${trade.id}`).update({
            status: 'rejected'
          }),
          this.afs.doc<Task>(`tasks/${trade.taskOffered}`).update({
            isInvolvedInTrade: false,
            idTrade: ''
          })
        ]);

        throw new Error(TradeErrorCodes.SenderUserDoesNotHaveEnoughScore);
      }

      if (taskOffered.completed) {
        await Promise.all([
          this.afs.doc<Trade>(`trades/${trade.id}`).update({
            status: 'rejected'
          }),
          this.afs.doc<Task>(`tasks/${trade.taskOffered}`).update({
            isInvolvedInTrade: false,
            idTrade: ''
          })
        ]);

        throw new Error(TradeErrorCodes.TaskOfferedIsAlreadyCompleted);
      }

      if (trade.tradeType === 'task' && taskRequested!.completed) {
        await Promise.all([
          this.afs.doc<Trade>(`trades/${trade.id}`).update({
            status: 'rejected'
          }),
          this.afs.doc<Task>(`tasks/${trade.taskOffered}`).update({
            isInvolvedInTrade: false,
            idTrade: ''
          })
        ]);
        throw new Error(TradeErrorCodes.TaskRequestedIsAlreadyCompleted);
      }

      if (taskOffered.idUserAssigned !== userSender.id) {
        await this.afs.doc<Trade>(`trades/${trade.id}`).update({
          status: 'rejected'
        });
        throw new Error(TradeErrorCodes.TaskOfferedAlreadyBelongsToAnotherUser);
      }

      if (trade.tradeType === 'task' && taskRequested!.idUserAssigned !== userReceiver.id) {
        await this.afs.doc<Trade>(`trades/${trade.id}`).update({
          status: 'rejected'
        });
        throw new Error(TradeErrorCodes.TaskRequestedAlreadyBelongsToAnotherUser);
      }

      const batch = this.afs.firestore.batch();
      const taskOfferedRef = this.afs.doc<Task>(`tasks/${taskOffered.id}`).ref;
      batch.update(taskOfferedRef, {
        idUserAssigned: userReceiver.id,
        isInvolvedInTrade: false,
        idTrade: ''
      });

      if (trade.tradeType === 'score') {
        const teamRef = this.afs.doc<Team>(`teams/${idTeam}`).ref;
        const userReceiverRef = this.afs.doc<User>(`users/${userReceiver.id}`).ref;
        const userSenderRef = this.afs.doc<User>(`users/${userSender.id}`).ref;

        batch.update(teamRef, {
          [`taskLists.${idTaskList}.userScore.${userReceiver.id}`]:
            firebase.firestore.FieldValue.increment(trade.scoreOffered),
          [`userMembers.${userReceiver.id}.userTotalScore`]:
            firebase.firestore.FieldValue.increment(trade.scoreOffered),
          [`taskLists.${idTaskList}.userScore.${userSender.id}`]:
            firebase.firestore.FieldValue.increment(-trade.scoreOffered),
          [`userMembers.${userSender.id}.userTotalScore`]: firebase.firestore.FieldValue.increment(
            -trade.scoreOffered
          )
        });

        batch.update(userSenderRef, {
          totalTasksAssigned: firebase.firestore.FieldValue.increment(-1)
        });

        batch.update(userReceiverRef, {
          totalTasksAssigned: firebase.firestore.FieldValue.increment(1)
        });
      } else {
        const taskRequestedRef = this.afs.doc<Task>(`tasks/${idTaskRequested}`).ref;
        batch.update(taskRequestedRef, {
          idUserAssigned: userSender.id
        });
      }

      const tradeRef = this.afs.doc<Trade>(`trades/${trade.id}`).ref;
      batch.update(tradeRef, {
        status: 'accepted'
      });

      await batch.commit();

      this.toastService.showToast({
        message: 'Se ha aceptado el intercambio',
        icon: 'checkmark-circle',
        cssClass: 'toast-success'
      });
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async rejectTrade(trade: Trade) {
    try {
      const { idTeam, idTaskList, userReceiver, userSender } = trade;
      const [team, taskOffered] = await Promise.all([
        firstValueFrom(this.teamService.getTeam(idTeam)),
        firstValueFrom(this.taskService.getTaskObservable(trade.taskOffered))
      ]);

      if (!team) {
        throw new Error(TeamErrorCodes.TeamNotFound);
      }

      if (!team.taskLists[idTaskList]) {
        throw new Error(TeamErrorCodes.TaskListNotFound);
      }

      if (!team.userMembers[userReceiver.id] || !team.userMembers[userSender.id]) {
        throw new Error(TeamErrorCodes.UserDoesNotBelongToTeam);
      }

      if (!taskOffered) {
        throw new Error(TaskErrorCodes.TaskNotFound);
      }

      const batch = this.afs.firestore.batch();
      const tradeRef = this.afs.doc<Trade>(`trades/${trade.id}`).ref;
      batch.update(tradeRef, {
        status: 'rejected'
      });

      const taskOfferedRef = this.afs.doc<Task>(`tasks/${trade.taskOffered}`).ref;
      batch.update(taskOfferedRef, {
        isInvolvedInTrade: false,
        idTrade: ''
      });

      await batch.commit();

      this.toastService.showToast({
        message: 'Se ha rechazado el intercambio',
        icon: 'checkmark-circle',
        cssClass: 'toast-success'
      });
    } catch (error) {
      console.error(error);
      this.handleError(error);
    }
  }

  async deleteTrade(trade: Trade) {
    const { idTeam, idTaskList, userReceiver, userSender } = trade;
    const team = await firstValueFrom(this.teamService.getTeam(idTeam));

    if (!team) {
      throw new Error(TeamErrorCodes.TeamNotFound);
    }

    if (!team.taskLists[idTaskList]) {
      throw new Error(TeamErrorCodes.TaskListNotFound);
    }

    if (!team.userMembers[userReceiver.id] || !team.userMembers[userSender.id]) {
      throw new Error(TeamErrorCodes.UserDoesNotBelongToTeam);
    }

    const batch = this.afs.firestore.batch();
    const tradeRef = this.afs.doc<Trade>(`trades/${trade.id}`).ref;
    batch.delete(tradeRef);

    if (trade.status === 'pending') {
      const taskOffered = await firstValueFrom(
        this.taskService.getTaskObservable(trade.taskOffered)
      );

      if (taskOffered) {
        const taskOfferedRef = this.afs.doc<Task>(`tasks/${trade.taskOffered}`).ref;
        batch.update(taskOfferedRef, {
          isInvolvedInTrade: false,
          idTrade: ''
        });
      }
    }

    await batch.commit();

    this.toastService.showToast({
      message: 'Se ha eliminado el intercambio',
      icon: 'checkmark-circle',
      cssClass: 'toast-success'
    });
  }

  handleError(error: any) {
    const message =
      collabTaskErrors[error.message] ??
      'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo más tarde';

    this.toastService.showToast({
      message,
      icon: 'close-circle',
      cssClass: 'toast-error'
    });
  }
}
